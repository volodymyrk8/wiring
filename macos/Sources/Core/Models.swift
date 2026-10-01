import Foundation

/// The server is loose with types (age may be a string, photos strings or objects), so decoding is lenient.
private extension KeyedDecodingContainer {
    func lenientInt(_ key: Key) -> Int? {
        if let v = try? decodeIfPresent(Int.self, forKey: key) { return v }
        if let s = try? decodeIfPresent(String.self, forKey: key) { return Int(s) }
        return nil
    }
    func string(_ key: Key) -> String? { (try? decodeIfPresent(String.self, forKey: key)) ?? nil }
    func strings(_ key: Key) -> [String] { (try? decodeIfPresent([String].self, forKey: key)) ?? [] }
    func bool(_ key: Key) -> Bool { (try? decodeIfPresent(Bool.self, forKey: key)) ?? false }
}

private struct PhotoRef: Decodable {
    let url: String?
    let id: Int?
    let isPrimary: Bool?
    init(from decoder: Decoder) throws {
        if let s = try? decoder.singleValueContainer().decode(String.self) {
            url = s; id = nil; isPrimary = nil; return
        }
        let c = try decoder.container(keyedBy: CodingKeys.self)
        url = try? c.decodeIfPresent(String.self, forKey: .url)
        id = try? c.decodeIfPresent(Int.self, forKey: .id)
        isPrimary = try? c.decodeIfPresent(Bool.self, forKey: .isPrimary)
    }
    enum CodingKeys: String, CodingKey { case url, id, isPrimary }
}

struct Person: Decodable, Identifiable, Hashable {
    var id: Int
    var name: String
    var age: Int?
    var city: String?
    var job: String?
    var bio: String?
    var photo: String?
    var photos: [String]
    var neuro: [String]
    var vibe: [String]
    var intents: [String]
    var online: Bool
    var hidden: Bool
    var matched: Bool
    // Present on /api/matches rows
    var lastMessage: String?
    var lastAt: Int?
    var unread: Int?

    enum CodingKeys: String, CodingKey {
        case id, name, age, city, job, bio, photo, photos, neuro, vibe, intents, online, hidden, matched, lastMessage, lastAt, unread
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = c.lenientInt(.id) ?? -Int.random(in: 1...1_000_000_000) // hidden likes have no id
        name = c.string(.name) ?? ""
        age = c.lenientInt(.age)
        city = c.string(.city)
        job = c.string(.job)
        bio = c.string(.bio)
        photo = c.string(.photo)
        let refs = (try? c.decodeIfPresent([PhotoRef].self, forKey: .photos)) ?? nil
        photos = (refs ?? []).compactMap(\.url)
        if photos.isEmpty, let p = photo, !p.isEmpty { photos = [p] }
        neuro = c.strings(.neuro)
        vibe = c.strings(.vibe)
        intents = c.strings(.intents)
        online = c.bool(.online)
        hidden = c.bool(.hidden)
        matched = c.bool(.matched)
        lastMessage = c.string(.lastMessage)
        lastAt = c.lenientInt(.lastAt)
        unread = c.lenientInt(.unread)
    }

    init(id: Int, name: String, age: Int? = nil, city: String? = nil, job: String? = nil, bio: String? = nil, photos: [String] = [], neuro: [String] = [], vibe: [String] = [], online: Bool = false, lastMessage: String? = nil, lastAt: Int? = nil, unread: Int? = nil) {
        self.id = id; self.name = name; self.age = age; self.city = city; self.job = job; self.bio = bio
        self.photo = photos.first; self.photos = photos; self.neuro = neuro; self.vibe = vibe; self.intents = []
        self.online = online; self.hidden = false; self.matched = false
        self.lastMessage = lastMessage; self.lastAt = lastAt; self.unread = unread
    }

    var title: String { age.map { "\(name), \($0)" } ?? name }
    var subtitle: String { [city, job].compactMap { $0?.isEmpty == false ? $0 : nil }.joined(separator: " · ") }
}

struct PhotoItem: Decodable, Identifiable, Hashable {
    var id: Int
    var url: String
    var isPrimary: Bool
}

struct Me: Decodable {
    var person: Person
    var email: String
    var plus: Bool
    var notifyEnabled: Bool
    var notifyPush: Bool
    var unread: Int
    var likesIn: Int
    var needsProfile: Bool
    var needsSpecialConsent: Bool
    var needsPhotoConsent: Bool
    var gender: String
    var lookingFor: String
    var photoItems: [PhotoItem]
    var seekMinAge: Int
    var seekMaxAge: Int
    var seekPlace: String
    var hideTags: [String]

    enum CodingKeys: String, CodingKey {
        case email, plus, notifyEnabled, notifyPush, unread, likesIn, needsProfile, needsSpecialConsent, needsPhotoConsent
        case gender, lookingFor, photos, seekMinAge, seekMaxAge, seekPlace, hideTags
    }

    init(from decoder: Decoder) throws {
        person = try Person(from: decoder)
        let c = try decoder.container(keyedBy: CodingKeys.self)
        func b(_ k: CodingKeys, _ d: Bool) -> Bool { ((try? c.decodeIfPresent(Bool.self, forKey: k)) ?? nil) ?? d }
        func i(_ k: CodingKeys, _ d: Int) -> Int { ((try? c.decodeIfPresent(Int.self, forKey: k)) ?? nil) ?? d }
        func s(_ k: CodingKeys) -> String { ((try? c.decodeIfPresent(String.self, forKey: k)) ?? nil) ?? "" }
        email = s(.email)
        plus = b(.plus, false)
        notifyEnabled = b(.notifyEnabled, true)
        notifyPush = b(.notifyPush, false)
        unread = i(.unread, 0)
        likesIn = i(.likesIn, 0)
        needsProfile = b(.needsProfile, false)
        needsSpecialConsent = b(.needsSpecialConsent, false)
        needsPhotoConsent = b(.needsPhotoConsent, false)
        gender = s(.gender)
        lookingFor = s(.lookingFor)
        // /api/me returns photos as objects; other endpoints may return plain URLs (no id, not editable).
        photoItems = ((try? c.decodeIfPresent([PhotoItem].self, forKey: .photos)) ?? nil) ?? []
        seekMinAge = i(.seekMinAge, 18)
        seekMaxAge = i(.seekMaxAge, 99)
        seekPlace = s(.seekPlace)
        hideTags = ((try? c.decodeIfPresent([String].self, forKey: .hideTags)) ?? nil) ?? []
    }
}

struct Message: Decodable, Identifiable, Hashable {
    var id: Int
    var fromId: Int
    var mine: Bool?
    var body: String?
    var photoUrl: String?
    var audioUrl: String?
    var transcript: String?
    var createdAt: Int
}

struct Thread: Decodable {
    var peer: Person
    var messages: [Message]
    var openers: [String]?
    var hasMore: Bool?
}

struct FeedPage: Decodable { var cards: [Person]; var hasMore: Bool }
struct LikesPage: Decodable { var likes: [Person]; var plus: Bool }
struct MatchesPage: Decodable { var matches: [Person] }
struct MeResponse: Decodable { var user: Me? }
struct PersonResponse: Decodable { var person: Person }
struct SaveResponse: Decodable { var user: Me }
struct TokenResponse: Decodable { var accessToken: String; var refreshToken: String; var user: Me? }
struct SwipeResponse: Decodable { var matched: Bool? }
struct RewindResponse: Decodable { var card: Person? }

struct CatalogItem: Decodable, Identifiable, Hashable { var id: String; var label: String? }
struct Place: Decodable, Hashable { var country: String; var cities: [String] }
struct Catalog: Decodable {
    var neuro: [CatalogItem]?
    var vibe: [CatalogItem]?
    var intents: [CatalogItem]?
    var genders: [CatalogItem]?
    var lookingFor: [CatalogItem]?
    var places: [Place]?

    func label(_ id: String) -> String {
        for list in [neuro, vibe, intents] { if let hit = list?.first(where: { $0.id == id }) { return hit.label ?? id } }
        return id
    }
}

/// Same fields and parameter names as the web and mobile feed filters.
struct Filters: Equatable, Codable {
    var neuro: [String] = []
    var vibe: [String] = []
    var intents: [String] = []
    var minAge = 18
    var maxAge = 99
    var city = ""
    var hideUndiagnosed = true

    var activeCount: Int {
        (neuro.isEmpty ? 0 : 1) + (vibe.isEmpty ? 0 : 1) + (intents.isEmpty ? 0 : 1)
            + (minAge != 18 || maxAge != 99 ? 1 : 0) + (city.isEmpty ? 0 : 1) + (hideUndiagnosed ? 0 : 1)
    }

    var queryItems: [URLQueryItem] {
        var q: [URLQueryItem] = []
        if !neuro.isEmpty { q.append(.init(name: "neuro", value: neuro.joined(separator: ","))) }
        if !vibe.isEmpty { q.append(.init(name: "vibe", value: vibe.joined(separator: ","))) }
        if !intents.isEmpty { q.append(.init(name: "intent", value: intents.joined(separator: ","))) }
        if minAge > 18 { q.append(.init(name: "min_age", value: String(minAge))) }
        if maxAge < 99 { q.append(.init(name: "max_age", value: String(maxAge))) }
        if !city.isEmpty { q.append(.init(name: "city", value: city)) }
        if !hideUndiagnosed { q.append(.init(name: "hide_empty", value: "0")) }
        return q
    }
}
