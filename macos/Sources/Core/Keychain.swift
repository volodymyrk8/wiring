import Foundation
import Security

/// Token storage.
///
/// Signed builds (TestFlight / App Store) use the data-protection keychain: items belong to the app's
/// identity, so macOS never shows a "wants to use your confidential information" prompt.
/// Ad-hoc signed development builds cannot use it (errSecMissingEntitlement) and every rebuild has a
/// new signature, which made the legacy login keychain prompt on each launch; they keep tokens in a
/// file inside the app's sandbox container instead.
enum Keychain {
    private static let service = "date.wiring.mac"
    private static let missingEntitlement: OSStatus = -34018

    private static var useFile = false

    private static func base(_ key: String) -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
            kSecUseDataProtectionKeychain as String: true,
        ]
    }

    static func get(_ key: String) -> String? {
        if useFile { return fileStore()[key] }
        var query = base(key)
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var out: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &out)
        if status == missingEntitlement { useFile = true; return fileStore()[key] }
        guard status == errSecSuccess, let data = out as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    static func set(_ key: String, _ value: String?) {
        if useFile { return setFile(key, value) }
        let q = base(key)
        let status = SecItemDelete(q as CFDictionary)
        if status == missingEntitlement { useFile = true; return setFile(key, value) }
        guard let value, let data = value.data(using: .utf8) else { return }
        var add = q
        add[kSecValueData as String] = data
        add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        if SecItemAdd(add as CFDictionary, nil) == missingEntitlement { useFile = true; setFile(key, value) }
    }

    // MARK: development fallback (inside the sandbox container, readable only by this app)

    private static var fileURL: URL {
        let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir.appendingPathComponent("session.plist")
    }

    private static func fileStore() -> [String: String] {
        (try? PropertyListDecoder().decode([String: String].self, from: Data(contentsOf: fileURL))) ?? [:]
    }

    private static func setFile(_ key: String, _ value: String?) {
        var store = fileStore()
        store[key] = value
        if let data = try? PropertyListEncoder().encode(store) {
            try? data.write(to: fileURL, options: [.atomic, .completeFileProtection])
            try? FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: fileURL.path)
        }
    }
}
