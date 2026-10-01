import AppKit
import SwiftUI

/// `WIRING --selftest`: API smoke test against WIRING_API_URL with WIRING_TEST_EMAIL / WIRING_TEST_PASSWORD.
/// Meant for a local development server; prints PASS/FAIL per step and exits with a status code.
enum SelfTest {
    static func run() {
        let sem = DispatchSemaphore(value: 0)
        var failed = 0
        Task {
            func step(_ name: String, _ body: () async throws -> String) async {
                do { print("PASS \(name): \(try await body())") } catch { failed += 1; print("FAIL \(name): \(error.localizedDescription)") }
            }
            let env = ProcessInfo.processInfo.environment
            guard let email = env["WIRING_TEST_EMAIL"], let password = env["WIRING_TEST_PASSWORD"] else {
                print("set WIRING_TEST_EMAIL and WIRING_TEST_PASSWORD"); failed = 1; sem.signal(); return
            }
            print("server: \(Config.apiURL)")
            await step("login") {
                let r = try await API.shared.send(TokenResponse.self, "/api/auth/token", json: ["email": email, "password": password, "device": "selftest"])
                await API.shared.setTokens(access: r.accessToken, refresh: r.refreshToken)
                return r.user?.person.name ?? "?"
            }
            await step("me") { let m = try await API.shared.get(MeResponse.self, "/api/me"); return "unread=\(m.user?.unread ?? -1) likes=\(m.user?.likesIn ?? -1)" }
            await step("catalog") { let c = try await API.shared.get(Catalog.self, "/api/catalog"); return "neuro=\(c.neuro?.count ?? 0) places=\(c.places?.count ?? 0)" }
            await step("feed") { "\(try await API.shared.get(FeedPage.self, "/api/feed", query: [.init(name: "hide_empty", value: "1")]).cards.count) cards" }
            await step("feed+filters") { "\(try await API.shared.get(FeedPage.self, "/api/feed", query: Filters(minAge: 25, maxAge: 40).queryItems).cards.count) cards" }
            await step("likes") { "\(try await API.shared.get(LikesPage.self, "/api/likes").likes.count) likes" }
            var firstMatch: Person?
            await step("matches") { let m = try await API.shared.get(MatchesPage.self, "/api/matches").matches; firstMatch = m.first; return "\(m.count) chats" }
            if let peer = firstMatch {
                await step("thread") { let t = try await API.shared.get(Thread.self, "/api/messages/\(peer.id)", query: [.init(name: "limit", value: "50")]); return "\(t.messages.count) messages, peer=\(t.peer.name)" }
                if env["WIRING_TEST_WRITE"] == "1" {
                    await step("idempotent send") {
                        let cid = "selftest-\(UUID().uuidString.prefix(8))"
                        let body: [String: Any] = ["to_id": peer.id, "body": "selftest from macOS", "client_id": cid]
                        _ = try await API.shared.raw("/api/messages", method: "POST", json: body)
                        let again = try JSONSerialization.jsonObject(with: try await API.shared.raw("/api/messages", method: "POST", json: body)) as? [String: Any]
                        guard again?["duplicate"] as? Bool == true else { throw APIError(message: "second send was not deduplicated", status: 0) }
                        return "deduplicated"
                    }
                }
                await step("person") { try await API.shared.get(PersonResponse.self, "/api/people/\(peer.id)").person.title }
            }
            await step("refresh rotation") {
                await API.shared.setTokens(access: "stale", refresh: await API.shared.refreshToken())
                return try await API.shared.get(MeResponse.self, "/api/me").user?.person.name ?? "?"
            }
            await step("logout") {
                _ = try await API.shared.raw("/api/auth/logout", method: "POST", json: ["refresh_token": await API.shared.refreshToken() ?? ""])
                await API.shared.setTokens(access: nil, refresh: nil)
                return "ok"
            }
            sem.signal()
        }
        sem.wait()
        print(failed == 0 ? "ALL PASSED" : "\(failed) FAILED")
        exit(failed == 0 ? 0 : 1)
    }
}

/// With WIRING_SNAPSHOT_DIR set (development only), signs in with the test credentials, walks the
/// sections and writes window images, then quits. Uses the app's own window, so no screen-recording
/// permission is needed.
enum Snapshots {
    static var directory: String? { ProcessInfo.processInfo.environment["WIRING_SNAPSHOT_DIR"] }

    @MainActor
    static func run(model: AppModel) async {
        guard let dir = directory else { return }
        let env = ProcessInfo.processInfo.environment
        if model.phase != .signedIn {
            try? await Task.sleep(nanoseconds: 1_500_000_000)
            capture(into: dir, name: "00-login")
            if let e = env["WIRING_TEST_EMAIL"], let p = env["WIRING_TEST_PASSWORD"] { try? await model.login(email: e, password: p) }
        }
        for (i, s) in Section.allCases.enumerated() {
            model.section = s
            try? await Task.sleep(nanoseconds: 4_000_000_000)
            capture(into: dir, name: String(format: "%02d-%@", i + 1, s.rawValue))
        }
        model.section = .chats
        try? await Task.sleep(nanoseconds: 1_000_000_000)
        if let first = try? await API.shared.get(MatchesPage.self, "/api/matches").matches.first {
            model.openChatId = first.id
            try? await Task.sleep(nanoseconds: 4_000_000_000)
            capture(into: dir, name: "05-conversation")
        }
        model.section = .profile
        try? await Task.sleep(nanoseconds: 1_500_000_000)
        model.editingProfile = true
        try? await Task.sleep(nanoseconds: 4_000_000_000)
        capture(into: dir, name: "06-edit-profile", sheet: true)
        model.editingProfile = false
        try? await Task.sleep(nanoseconds: 1_500_000_000)
        model.editingVisibility = true
        try? await Task.sleep(nanoseconds: 3_000_000_000)
        capture(into: dir, name: "07-visibility", sheet: true)
        model.editingVisibility = false
        try? await Task.sleep(nanoseconds: 1_000_000_000)
        NSApp.terminate(nil)
    }

    @MainActor
    static func capture(into dir: String, name: String, sheet: Bool = false) {
        let candidate = sheet
            ? NSApp.windows.first(where: { $0.isSheet && $0.isVisible })
            : NSApp.windows.first(where: { $0.isVisible && $0.contentView != nil && $0.title == "WIRING" })
        guard let window = candidate ?? NSApp.windows.first,
              let view = window.contentView?.superview ?? window.contentView,
              let rep = view.bitmapImageRepForCachingDisplay(in: view.bounds) else { return }
        view.cacheDisplay(in: view.bounds, to: rep)
        // The sandbox only allows writing inside the app container, so a relative/unwritable dir
        // falls back to <container>/tmp/wiring-snapshots.
        var base = URL(fileURLWithPath: dir)
        if !FileManager.default.isWritableFile(atPath: base.path) {
            base = FileManager.default.temporaryDirectory.appendingPathComponent("wiring-snapshots")
            try? FileManager.default.createDirectory(at: base, withIntermediateDirectories: true)
        }
        let url = base.appendingPathComponent("\(name).png")
        try? rep.representation(using: .png, properties: [:])?.write(to: url)
        print("snapshot \(url.path)")
    }
}
