import Foundation

enum Config {
    /// API base URL. Override for a local server with `defaults write date.wiring.app apiURL http://127.0.0.1:5070`
    /// or the WIRING_API_URL environment variable.
    static var apiURL: URL {
        let raw = ProcessInfo.processInfo.environment["WIRING_API_URL"]
            ?? UserDefaults.standard.string(forKey: "apiURL")
            ?? "https://wiring.date"
        return URL(string: raw.trimmingCharacters(in: CharacterSet(charactersIn: "/"))) ?? URL(string: "https://wiring.date")!
    }

    static let appVersion = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "1.0.0"

    static func media(_ path: String?) -> URL? {
        guard let path, !path.isEmpty else { return nil }
        if path.hasPrefix("http://") || path.hasPrefix("https://") || path.hasPrefix("file://") { return URL(string: path) }
        return URL(string: apiURL.absoluteString + (path.hasPrefix("/") ? path : "/" + path))
    }
}
