import Foundation

struct APIError: LocalizedError {
    var message: String
    var status: Int
    var tokenExpired = false
    var upgrade = false
    var errorDescription: String? { message }
}

/// HTTP client for the WIRING API: bearer tokens from the keychain, one shared refresh rotation
/// for concurrent 401s, and the same error shapes as the mobile client.
actor API {
    static let shared = API()

    private var access: String? = Keychain.get("access")
    private var refresh: String? = Keychain.get("refresh")
    private var refreshing: Task<Bool, Never>?
    private let session: URLSession = {
        let cfg = URLSessionConfiguration.default
        cfg.httpCookieStorage = nil // tokens only; never pick up a web session cookie
        cfg.timeoutIntervalForRequest = 20
        return URLSession(configuration: cfg)
    }()
    private let decoder: JSONDecoder = {
        let d = JSONDecoder()
        d.keyDecodingStrategy = .convertFromSnakeCase
        return d
    }()

    var hasSession: Bool { access != nil || refresh != nil }

    func setTokens(access: String?, refresh: String?) {
        self.access = access
        self.refresh = refresh
        Keychain.set("access", access)
        Keychain.set("refresh", refresh)
    }

    func refreshToken() -> String? { refresh }

    // MARK: transport

    private func makeRequest(_ path: String, method: String, query: [URLQueryItem], body: Data?, contentType: String?) -> URLRequest {
        var comps = URLComponents(url: Config.apiURL.appendingPathComponent(path), resolvingAgainstBaseURL: false)!
        if !query.isEmpty { comps.queryItems = query }
        var req = URLRequest(url: comps.url!)
        req.httpMethod = method
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        req.setValue(Config.appVersion, forHTTPHeaderField: "X-App-Version")
        req.setValue("macos", forHTTPHeaderField: "X-App-Platform")
        if let access, !path.hasPrefix("/api/auth/") { req.setValue("Bearer \(access)", forHTTPHeaderField: "Authorization") }
        if let body {
            req.httpBody = body
            req.setValue(contentType ?? "application/json", forHTTPHeaderField: "Content-Type")
        }
        return req
    }

    private func perform(_ req: URLRequest) async throws -> (Data, Int, [String: Any]) {
        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: req)
        } catch {
            throw APIError(message: "Нет соединения с сервером", status: 0)
        }
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        let obj = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] ?? [:]
        if data.isEmpty == false, obj.isEmpty, (try? JSONSerialization.jsonObject(with: data)) == nil {
            throw APIError(message: status >= 500 ? "Сервер временно недоступен" : "Сервер вернул неожиданный ответ", status: status)
        }
        return (data, status, obj)
    }

    private func rotate() async -> Bool {
        if let refreshing { return await refreshing.value }
        let task = Task<Bool, Never> {
            guard let refresh = self.refresh else { return false }
            let body = try? JSONSerialization.data(withJSONObject: ["refresh_token": refresh])
            let req = self.makeRequest("/api/auth/refresh", method: "POST", query: [], body: body, contentType: nil)
            do {
                let (_, status, obj) = try await self.perform(req)
                guard status == 200, let a = obj["access_token"] as? String, let r = obj["refresh_token"] as? String else { return false }
                self.setTokens(access: a, refresh: r)
                return true
            } catch {
                return true // offline: keep the session, the caller sees the network error
            }
        }
        refreshing = task
        let ok = await task.value
        refreshing = nil
        return ok
    }

    func raw(_ path: String, method: String = "GET", query: [URLQueryItem] = [], json: [String: Any]? = nil, multipart: (Data, String)? = nil, retried: Bool = false) async throws -> Data {
        let body = multipart?.0 ?? (json.flatMap { try? JSONSerialization.data(withJSONObject: $0) })
        let req = makeRequest(path, method: method, query: query, body: body, contentType: multipart?.1)
        let (data, status, obj) = try await perform(req)
        if status == 401, obj["token_expired"] as? Bool == true, !retried, !path.hasPrefix("/api/auth/") {
            if await rotate() { return try await raw(path, method: method, query: query, json: json, multipart: multipart, retried: true) }
            setTokens(access: nil, refresh: nil)
            throw APIError(message: "Сессия истекла, войди снова", status: 401, tokenExpired: true)
        }
        if status >= 400 || obj["ok"] as? Bool == false {
            throw APIError(
                message: (obj["error"] as? String).map { $0.prefix(1).uppercased() + $0.dropFirst() } ?? "Ошибка \(status)",
                status: status,
                tokenExpired: obj["token_expired"] as? Bool == true,
                upgrade: status == 426
            )
        }
        return data
    }

    func get<T: Decodable>(_ type: T.Type, _ path: String, query: [URLQueryItem] = []) async throws -> T {
        try decoder.decode(T.self, from: try await raw(path, query: query))
    }

    func send<T: Decodable>(_ type: T.Type, _ path: String, method: String = "POST", json: [String: Any]) async throws -> T {
        try decoder.decode(T.self, from: try await raw(path, method: method, json: json))
    }

    /// Profile photo upload; `photo_rights_consent` confirms the person uploads only their own photos.
    func uploadProfilePhoto(file: URL) async throws {
        let boundary = "wiring-\(UUID().uuidString)"
        var body = Data()
        func part(_ s: String) { body.append(s.data(using: .utf8)!) }
        part("--\(boundary)\r\nContent-Disposition: form-data; name=\"photo_rights_consent\"\r\n\r\n1\r\n")
        part("--\(boundary)\r\nContent-Disposition: form-data; name=\"file\"; filename=\"\(file.lastPathComponent)\"\r\nContent-Type: image/jpeg\r\n\r\n")
        body.append(try Data(contentsOf: file))
        part("\r\n--\(boundary)--\r\n")
        _ = try await raw("/api/photos", method: "POST", multipart: (body, "multipart/form-data; boundary=\(boundary)"))
    }

    func sendPhoto(to peer: Int, file: URL) async throws {
        let boundary = "wiring-\(UUID().uuidString)"
        var body = Data()
        func part(_ s: String) { body.append(s.data(using: .utf8)!) }
        part("--\(boundary)\r\nContent-Disposition: form-data; name=\"to_id\"\r\n\r\n\(peer)\r\n")
        let data = try Data(contentsOf: file)
        part("--\(boundary)\r\nContent-Disposition: form-data; name=\"file\"; filename=\"\(file.lastPathComponent)\"\r\nContent-Type: image/jpeg\r\n\r\n")
        body.append(data)
        part("\r\n--\(boundary)--\r\n")
        _ = try await raw("/api/messages/photo", method: "POST", multipart: (body, "multipart/form-data; boundary=\(boundary)"))
    }
}
