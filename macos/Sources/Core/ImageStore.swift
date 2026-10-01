import AppKit
import SwiftUI

/// Small in-memory image cache shared by all views.
@MainActor
final class ImageStore {
    static let shared = ImageStore()
    private var cache: [URL: NSImage] = [:]
    private var inflight: [URL: Task<NSImage?, Never>] = [:]

    func cached(_ url: URL) -> NSImage? { cache[url] }
    func preload(_ url: URL, _ image: NSImage) { cache[url] = image }

    func image(for url: URL) async -> NSImage? {
        if let hit = cache[url] { return hit }
        if let task = inflight[url] { return await task.value }
        let task = Task<NSImage?, Never> {
            guard let (data, _) = try? await URLSession.shared.data(from: url) else { return nil }
            return NSImage(data: data)
        }
        inflight[url] = task
        let img = await task.value
        inflight[url] = nil
        if let img { cache[url] = img }
        return img
    }
}

struct RemoteImage: View {
    let path: String?
    var contentMode: ContentMode = .fill
    @State private var image: NSImage?

    var body: some View {
        let url = Config.media(path)
        ZStack {
            Rectangle().fill(Color.accentColor.opacity(0.08))
            if let img = image ?? url.flatMap({ ImageStore.shared.cached($0) }) {
                Image(nsImage: img).resizable().aspectRatio(contentMode: contentMode)
            }
        }
        .task(id: url) {
            guard let url else { return }
            image = await ImageStore.shared.image(for: url)
        }
    }
}
