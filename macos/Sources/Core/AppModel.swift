import AppKit
import Observation
import UserNotifications

enum Section: String, CaseIterable, Identifiable, Hashable {
    case feed, likes, chats, profile
    var id: String { rawValue }
    var title: String {
        switch self {
        case .feed: "Лента"
        case .likes: "Лайки"
        case .chats: "Чаты"
        case .profile: "Профиль"
        }
    }
    var icon: String {
        switch self {
        case .feed: "flame"
        case .likes: "heart"
        case .chats: "bubble.left.and.bubble.right"
        case .profile: "person.crop.circle"
        }
    }
}

@MainActor
@Observable
final class AppModel {
    enum Phase { case loading, signedOut, signedIn }

    var phase: Phase = .loading
    var me: Me?
    var catalog: Catalog?
    var section: Section? = .feed
    var openChatId: Int?
    var editingProfile = false
    var editingVisibility = false
    var unread = 0
    var likesIn = 0
    var upgradeRequired = false
    var filters: Filters = AppModel.loadFilters() {
        didSet { AppModel.saveFilters(filters) }
    }

    private var pollTask: Task<Void, Never>?
    private static let pollSeconds: UInt64 = 30

    // MARK: lifecycle

    func start() async {
        if await API.shared.hasSession {
            await refreshMe()
        }
        phase = me == nil ? .signedOut : .signedIn
        if phase == .signedIn { afterSignIn() }
    }

    func login(email: String, password: String) async throws {
        let res = try await API.shared.send(TokenResponse.self, "/api/auth/token", json: [
            "email": email.trimmingCharacters(in: .whitespaces),
            "password": password,
            "device": "macOS \(Config.appVersion)",
        ])
        await API.shared.setTokens(access: res.accessToken, refresh: res.refreshToken)
        me = res.user
        apply(me)
        phase = .signedIn
        afterSignIn()
    }

    func logout() async {
        let refresh = await API.shared.refreshToken()
        _ = try? await API.shared.raw("/api/auth/logout", method: "POST", json: ["refresh_token": refresh ?? ""])
        await API.shared.setTokens(access: nil, refresh: nil)
        pollTask?.cancel()
        me = nil
        unread = 0
        likesIn = 0
        NSApp.dockTile.badgeLabel = nil
        phase = .signedOut
    }

    func refreshMe() async {
        do {
            let res = try await API.shared.get(MeResponse.self, "/api/me")
            if let user = res.user {
                let before = unread
                me = user
                apply(user)
                if user.unread > before, phase == .signedIn { notifyNewMessages(user.unread - before) }
            } else {
                me = nil
                phase = .signedOut
            }
        } catch let e as APIError {
            if e.upgrade { upgradeRequired = true }
            if e.tokenExpired { me = nil; phase = .signedOut }
        } catch {}
    }

    private func apply(_ user: Me?) {
        unread = user?.unread ?? 0
        likesIn = user?.likesIn ?? 0
        NSApp.dockTile.badgeLabel = unread > 0 ? String(unread) : nil
    }

    private func afterSignIn() {
        Task { await loadCatalog() }
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { _, _ in }
        pollTask?.cancel()
        pollTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: AppModel.pollSeconds * 1_000_000_000)
                await self?.refreshMe()
            }
        }
    }

    func loadCatalog() async {
        if catalog == nil { catalog = try? await API.shared.get(Catalog.self, "/api/catalog") }
    }

    func label(_ id: String) -> String { catalog?.label(id) ?? id }

    // MARK: notifications

    private func notifyNewMessages(_ count: Int) {
        guard me?.notifyEnabled == true, !NSApp.isActive else { return }
        let content = UNMutableNotificationContent()
        content.title = "WIRING"
        content.body = count == 1 ? "Новое сообщение" : "Новых сообщений: \(count)"
        content.sound = .default
        UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: UUID().uuidString, content: content, trigger: nil))
    }

    // MARK: filters persistence

    private static let filtersKey = "filters.v1"
    private static func loadFilters() -> Filters {
        guard let data = UserDefaults.standard.data(forKey: filtersKey), let f = try? JSONDecoder().decode(Filters.self, from: data) else { return Filters() }
        return f
    }
    private static func saveFilters(_ f: Filters) {
        if let data = try? JSONEncoder().encode(f) { UserDefaults.standard.set(data, forKey: filtersKey) }
    }
}
