import SwiftUI

struct FeedView: View {
    @Environment(AppModel.self) private var model
    @State private var queue: [Person] = []
    @State private var seen: [Int] = []
    @State private var loading = true
    @State private var hasMore = true
    @State private var error = ""
    @State private var photoIndex = 0
    @State private var match: Person?
    @State private var undo: Person?
    @State private var showFilters = false
    @State private var showProfile = false
    @State private var busy = false
    @State private var offset: CGFloat = 0
    @State private var requestId = 0

    var body: some View {
        content
            .navigationTitle("Лента")
            .toolbar {
                ToolbarItem {
                    Button { showFilters = true } label: {
                        Label(model.filters.activeCount > 0 ? "Фильтры (\(model.filters.activeCount))" : "Фильтры", systemImage: model.filters.activeCount > 0 ? "line.3.horizontal.decrease.circle.fill" : "line.3.horizontal.decrease.circle")
                    }
                    .help("Фильтры ленты")
                    .popover(isPresented: $showFilters, arrowEdge: .bottom) {
                        FiltersView(initial: model.filters) { f in
                            model.filters = f
                            showFilters = false
                            Task { await reload() }
                        }
                    }
                }
            }
            .task { if queue.isEmpty { await load() } }
            .sheet(item: $match) { person in MatchSheet(person: person) { match = nil } write: { match = nil; model.openChatId = person.id; model.section = .chats } }
            .sheet(isPresented: $showProfile) {
                if let p = queue.first { PersonView(personId: p.id, initial: p).frame(minWidth: 520, minHeight: 640) }
            }
    }

    @ViewBuilder private var content: some View {
        if loading && queue.isEmpty {
            ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
        } else if let person = queue.first {
            VStack(spacing: 18) {
                card(person)
                    .frame(maxWidth: 460, maxHeight: 640)
                    .offset(x: offset)
                    .rotationEffect(.degrees(Double(offset / 30)))
                actions
                Text("← пропустить · → нравится · пробел — следующее фото · I — профиль")
                    .font(.caption).foregroundStyle(.tertiary)
            }
            .padding(24)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .overlay(alignment: .top) { undoToast }
            .background(KeyCatcher { key in handle(key) })
        } else {
            VStack(spacing: 14) {
                EmptyState(icon: "sparkles", title: model.filters.activeCount > 0 ? "Никого по фильтрам" : "Пока всё",
                           text: model.filters.activeCount > 0 ? "Попробуй расширить возраст или убрать часть фильтров." : "Загляни позже — лента обновится.")
                    .frame(maxHeight: 320)
                HStack {
                    if model.filters.activeCount > 0 {
                        Button("Сбросить фильтры") { model.filters = Filters(); Task { await reload() } }.buttonStyle(.borderedProminent).tint(.wiring)
                    }
                    Button("Обновить") { Task { await reload() } }
                }
                if !error.isEmpty { Text(error).foregroundStyle(Color.pass) }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }

    private func card(_ p: Person) -> some View {
        ZStack(alignment: .bottom) {
            RemoteImage(path: p.photos.isEmpty ? p.photo : p.photos[min(photoIndex, p.photos.count - 1)])
                .clipped()
            HStack(spacing: 0) {
                Color.clear.contentShape(Rectangle()).onTapGesture { photoIndex = max(0, photoIndex - 1) }
                Color.clear.contentShape(Rectangle()).onTapGesture { photoIndex = min(max(p.photos.count - 1, 0), photoIndex + 1) }
            }
            if p.photos.count > 1 {
                VStack {
                    HStack(spacing: 4) {
                        ForEach(0..<p.photos.count, id: \.self) { i in
                            Capsule().fill(i == photoIndex ? Color.white : Color.white.opacity(0.4)).frame(height: 3)
                        }
                    }
                    .padding(12)
                    Spacer()
                }
            }
            LinearGradient(colors: [.clear, .black.opacity(0.75)], startPoint: .center, endPoint: .bottom).allowsHitTesting(false)
            HStack(alignment: .bottom) {
                VStack(alignment: .leading, spacing: 6) {
                    HStack {
                        Text(p.title).font(.system(size: 30, weight: .heavy))
                        if p.online { Circle().fill(Color.like).frame(width: 10, height: 10) }
                    }
                    if !p.subtitle.isEmpty { Text(p.subtitle).font(.title3).opacity(0.9) }
                    if let bio = p.bio, !bio.isEmpty { Text(bio).lineLimit(3).opacity(0.9) }
                    FlowLayout {
                        ForEach((p.neuro + p.vibe).prefix(6), id: \.self) { t in
                            Text(model.label(t)).font(.callout.weight(.semibold)).padding(.horizontal, 10).padding(.vertical, 5)
                                .background(.white.opacity(0.2), in: Capsule())
                        }
                    }
                }
                .foregroundStyle(.white)
                Spacer()
                Button { showProfile = true } label: { Image(systemName: "info").font(.title3.bold()).frame(width: 40, height: 40) }
                    .buttonStyle(.plain).foregroundStyle(.white).glassCircle()
                    .help("Профиль (I)")
            }
            .padding(20)
        }
        .clipShape(RoundedRectangle(cornerRadius: 28, style: .continuous))
        .shadow(color: .black.opacity(0.18), radius: 18, y: 8)
        .gesture(DragGesture().onChanged { offset = $0.translation.width }.onEnded { v in
            if v.translation.width > 120 { Task { await act("like") } }
            else if v.translation.width < -120 { Task { await act("pass") } }
            else { withAnimation(.spring) { offset = 0 } }
        })
    }

    private var actions: some View {
        HStack(spacing: 28) {
            roundButton("xmark", .pass, 58, "Пропустить (←)") { Task { await act("pass") } }
            roundButton("heart.fill", .like, 68, "Нравится (→)") { Task { await act("like") } }
        }
    }

    private func roundButton(_ icon: String, _ color: Color, _ size: CGFloat, _ help: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: icon).font(.system(size: size * 0.4, weight: .bold)).foregroundStyle(color).frame(width: size, height: size)
        }
        .buttonStyle(.plain)
        .glassCircle()
        .disabled(busy)
        .help(help)
    }

    @ViewBuilder private var undoToast: some View {
        if let p = undo {
            Button { Task { await undoLike() } } label: {
                Label("Лайк \(p.name) отправлен · Отменить", systemImage: "arrow.uturn.backward").padding(.horizontal, 14).padding(.vertical, 9)
            }
            .buttonStyle(.plain).glassSurface(cornerRadius: 20).padding(.top, 10)
            .transition(.move(edge: .top).combined(with: .opacity))
        }
    }

    private func handle(_ key: KeyCatcher.Key) {
        switch key {
        case .left: Task { await act("pass") }
        case .right: Task { await act("like") }
        case .space: if let p = queue.first, !p.photos.isEmpty { photoIndex = (photoIndex + 1) % p.photos.count }
        case .info: showProfile = true
        }
    }

    // MARK: data

    private func load() async {
        requestId += 1
        let id = requestId
        do {
            var q = model.filters.queryItems
            if q.isEmpty { q.append(.init(name: "hide_empty", value: "1")) }
            if !seen.isEmpty { q.append(.init(name: "skip", value: seen.suffix(200).map(String.init).joined(separator: ","))) }
            let page = try await API.shared.get(FeedPage.self, "/api/feed", query: q)
            guard id == requestId else { return }
            queue += page.cards.filter { c in !seen.contains(c.id) && !queue.contains(where: { $0.id == c.id }) }
            hasMore = page.hasMore
            error = ""
        } catch {
            if id == requestId { self.error = error.localizedDescription }
        }
        if id == requestId { loading = false }
    }

    private func reload() async {
        queue = []
        loading = true
        await load()
    }

    private func act(_ direction: String) async {
        guard let p = queue.first, !busy else { return }
        busy = true
        withAnimation(.easeIn(duration: 0.18)) { offset = direction == "like" ? 700 : -700 }
        do {
            let res = try await API.shared.send(SwipeResponse.self, "/api/swipe", json: ["target_id": p.id, "direction": direction])
            seen.append(p.id)
            queue.removeFirst()
            photoIndex = 0
            if res.matched == true { match = p; undo = nil }
            else if direction == "like" { withAnimation { undo = p }; scheduleUndoHide(p) }
            else { undo = nil }
            if hasMore && queue.count <= 2 { await load() }
        } catch {
            self.error = error.localizedDescription
        }
        offset = 0
        busy = false
    }

    private func scheduleUndoHide(_ p: Person) {
        Task {
            try? await Task.sleep(nanoseconds: 5_000_000_000)
            if undo?.id == p.id { withAnimation { undo = nil } }
        }
    }

    private func undoLike() async {
        do {
            let res = try await API.shared.send(RewindResponse.self, "/api/rewind", json: [:])
            undo = nil
            if let card = res.card {
                seen.removeAll { $0 == card.id }
                queue.insert(card, at: 0)
            }
        } catch {
            undo = nil
            self.error = error.localizedDescription
        }
    }
}

struct MatchSheet: View {
    let person: Person
    let close: () -> Void
    let write: () -> Void
    var body: some View {
        VStack(spacing: 14) {
            Avatar(path: person.photo, name: person.name, size: 120)
            Label("Взаимный лайк", systemImage: "heart.fill").font(.title.bold()).foregroundStyle(Color.wiring)
            Text("У вас взаимная симпатия с \(person.name). Можно написать первым.").foregroundStyle(.secondary).multilineTextAlignment(.center)
            HStack {
                Button("Продолжить ленту", action: close).keyboardShortcut(.cancelAction)
                Button("Написать", action: write).buttonStyle(.borderedProminent).tint(.wiring).keyboardShortcut(.defaultAction)
            }
            .controlSize(.large)
        }
        .padding(32)
        .frame(width: 420)
    }
}

/// Arrow keys, space and "i" for the feed, without stealing keys from text fields.
struct KeyCatcher: NSViewRepresentable {
    enum Key { case left, right, space, info }
    let onKey: (Key) -> Void

    func makeNSView(context: Context) -> NSView {
        let view = NSView()
        context.coordinator.monitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { event in
            if let responder = event.window?.firstResponder, responder is NSTextView { return event }
            switch event.keyCode {
            case 123: onKey(.left); return nil
            case 124: onKey(.right); return nil
            case 49: onKey(.space); return nil
            case 34: onKey(.info); return nil
            default: return event
            }
        }
        return view
    }
    func updateNSView(_ nsView: NSView, context: Context) {}
    static func dismantleNSView(_ nsView: NSView, coordinator: Coordinator) {
        if let m = coordinator.monitor { NSEvent.removeMonitor(m) }
    }
    func makeCoordinator() -> Coordinator { Coordinator() }
    final class Coordinator { var monitor: Any? }
}
