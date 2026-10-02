import SwiftUI

struct ChatsView: View {
    @Environment(AppModel.self) private var model
    @State private var matches: [Person]?
    @State private var selection: Int?
    @State private var search = ""
    @State private var error = ""

    private var filtered: [Person] {
        let all = matches ?? []
        let q = search.trimmingCharacters(in: .whitespaces).lowercased()
        return q.isEmpty ? all : all.filter { $0.name.lowercased().contains(q) || ($0.lastMessage ?? "").lowercased().contains(q) }
    }

    var body: some View {
        HSplitView {
            list
                .frame(minWidth: 260, idealWidth: 300, maxWidth: 380)
            Group {
                if let id = selection, let peer = matches?.first(where: { $0.id == id }) {
                    ConversationView(peer: peer) { Task { await load() } }
                        .id(id)
                } else {
                    EmptyState(icon: "bubble.left.and.bubble.right", title: matches?.isEmpty == true ? "Пока нет мэтчей" : "Выбери чат",
                               text: matches?.isEmpty == true ? "Когда вы с кем-то лайкнете друг друга, чат появится здесь." : nil)
                }
            }
            .frame(minWidth: 420, maxWidth: .infinity, maxHeight: .infinity)
        }
        .navigationTitle("Чаты")
        .toolbar {
            ToolbarItem { Button { Task { await load() } } label: { Label("Обновить", systemImage: "arrow.clockwise") }.keyboardShortcut("r") }
        }
        .task {
            await load()
            if let id = model.openChatId { selection = id; model.openChatId = nil }
        }
        .onChange(of: model.openChatId) { _, id in
            if let id { selection = id; model.openChatId = nil; Task { await load() } }
        }
        .onChange(of: model.unread) { _, _ in Task { await load() } }
    }

    private var list: some View {
        VStack(spacing: 0) {
            TextField("Поиск по чатам", text: $search)
                .textFieldStyle(.roundedBorder)
                .padding(12)
            if matches == nil {
                ProgressView().frame(maxHeight: .infinity)
            } else {
                List(filtered, selection: $selection) { m in
                    HStack(spacing: 12) {
                        Avatar(path: m.photo, name: m.name, size: 46, online: m.online)
                        VStack(alignment: .leading, spacing: 2) {
                            HStack {
                                Text(m.name).font(.headline)
                                Spacer()
                                Text(relativeTime(m.lastAt)).font(.caption).foregroundStyle((m.unread ?? 0) > 0 ? Color.wiring : .secondary)
                            }
                            HStack {
                                Text(m.lastMessage?.isEmpty == false ? m.lastMessage! : "Напиши первым 👋")
                                    .lineLimit(1).foregroundStyle((m.unread ?? 0) > 0 ? .primary : .secondary)
                                    .fontWeight((m.unread ?? 0) > 0 ? .semibold : .regular)
                                Spacer()
                                if let n = m.unread, n > 0 {
                                    Text("\(n)").font(.caption.bold()).foregroundStyle(.white).padding(.horizontal, 7).padding(.vertical, 2).background(Color.wiring, in: Capsule())
                                }
                            }
                        }
                    }
                    .padding(.vertical, 4)
                    .tag(m.id)
                }
                .listStyle(.sidebar)
            }
            if !error.isEmpty { Text(error).font(.caption).foregroundStyle(Color.pass).padding(8) }
        }
    }

    private func load() async {
        do {
            matches = try await API.shared.get(MatchesPage.self, "/api/matches").matches
            error = ""
        } catch {
            self.error = error.localizedDescription
            if matches == nil { matches = [] }
        }
    }
}

struct ConversationView: View {
    let peer: Person
    var onActivity: () -> Void = {}

    private struct Pending: Identifiable, Hashable { let id: String; let body: String; var failed = false }

    @State private var messages: [Message] = []
    @State private var pending: [Pending] = []
    @State private var openers: [String] = []
    @State private var hasMore = false
    @State private var ready = false
    @State private var text = ""
    @State private var error = ""
    @State private var lastId = 0
    @State private var showPerson = false
    @State private var sendingPhoto = false

    private static let pollSeconds: UInt64 = 5

    var body: some View {
        VStack(spacing: 0) {
            header
            Divider()
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(spacing: 6) {
                        if hasMore {
                            Button("Загрузить ранее") { Task { await loadEarlier() } }.buttonStyle(.link).padding(.vertical, 6)
                        }
                        if ready && messages.isEmpty && pending.isEmpty && !openers.isEmpty {
                            VStack(alignment: .leading, spacing: 8) {
                                Text("Как начать разговор:").foregroundStyle(.secondary)
                                ForEach(openers, id: \.self) { o in
                                    Button { text = o } label: { Text(o).frame(maxWidth: .infinity, alignment: .leading).padding(10) }
                                        .buttonStyle(.plain).background(Color.wiring.opacity(0.08), in: RoundedRectangle(cornerRadius: 12))
                                }
                            }
                            .padding()
                        }
                        ForEach(messages) { m in bubble(m).id(m.id) }
                        ForEach(pending) { p in pendingBubble(p).id(p.id) }
                        Color.clear.frame(height: 1).id("bottom")
                    }
                    .padding(.horizontal, 20).padding(.vertical, 12)
                }
                .onChange(of: messages.count) { _, _ in withAnimation { proxy.scrollTo("bottom", anchor: .bottom) } }
                .onChange(of: pending.count) { _, _ in withAnimation { proxy.scrollTo("bottom", anchor: .bottom) } }
                .onAppear { proxy.scrollTo("bottom", anchor: .bottom) }
            }
            if !error.isEmpty { Text(error).font(.caption).foregroundStyle(Color.pass).padding(.horizontal) }
            composer
        }
        .task {
            await poll(full: true)
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: Self.pollSeconds * 1_000_000_000)
                await poll(full: false)
            }
        }
        .sheet(isPresented: $showPerson) { PersonView(personId: peer.id, initial: peer).frame(minWidth: 520, minHeight: 640) }
    }

    private var header: some View {
        HStack(spacing: 12) {
            Avatar(path: peer.photo, name: peer.name, size: 36, online: peer.online)
            VStack(alignment: .leading, spacing: 0) {
                Text(peer.name).font(.headline)
                Text(peer.online ? "в сети" : peer.subtitle).font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
            Button { showPerson = true } label: { Label("Профиль", systemImage: "person.text.rectangle") }.help("Профиль, жалоба, блокировка")
        }
        .padding(.horizontal, 20).padding(.vertical, 10)
    }

    private func bubble(_ m: Message) -> some View {
        let mine = m.mine ?? (m.fromId != peer.id)
        return HStack {
            if mine { Spacer(minLength: 80) }
            VStack(alignment: .trailing, spacing: 4) {
                if let p = m.photoUrl, !p.isEmpty {
                    RemoteImage(path: p).frame(width: 240, height: 240).clipShape(RoundedRectangle(cornerRadius: 12))
                }
                if let a = m.audioUrl, !a.isEmpty {
                    Label(m.transcript?.isEmpty == false ? m.transcript! : "Голосовое сообщение", systemImage: "waveform")
                }
                if let b = m.body, !b.isEmpty { Text(b).textSelection(.enabled).fixedSize(horizontal: false, vertical: true) }
                Text(relativeTime(m.createdAt)).font(.caption2).opacity(0.65)
            }
            .padding(.horizontal, 12).padding(.vertical, 8)
            .foregroundStyle(mine ? Color.white : Color.primary)
            .background {
                if mine { RoundedRectangle(cornerRadius: 16, style: .continuous).fill(LinearGradient.wiring) }
                else { RoundedRectangle(cornerRadius: 16, style: .continuous).fill(Color.primary.opacity(0.07)) }
            }
            .frame(maxWidth: 460, alignment: mine ? .trailing : .leading)
            if !mine { Spacer(minLength: 80) }
        }
    }

    private func pendingBubble(_ p: Pending) -> some View {
        HStack {
            Spacer(minLength: 80)
            Button { if p.failed { Task { await deliver(p) } } } label: {
                VStack(alignment: .trailing, spacing: 4) {
                    Text(p.body)
                    Text(p.failed ? "Не отправлено · нажми, чтобы повторить" : "Отправляется…").font(.caption2).opacity(0.8)
                }
                .padding(.horizontal, 12).padding(.vertical, 8)
                .foregroundStyle(p.failed ? Color.primary : Color.white)
                .background(p.failed ? Color.pass.opacity(0.15) : Color.wiring.opacity(0.6), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            }
            .buttonStyle(.plain)
            .disabled(!p.failed)
        }
    }

    private var composer: some View {
        HStack(alignment: .bottom, spacing: 10) {
            Button { pickPhoto() } label: { Image(systemName: "photo").font(.title3) }
                .buttonStyle(.borderless).help("Отправить фото").disabled(sendingPhoto)
            TextField("Сообщение", text: $text, axis: .vertical)
                .textFieldStyle(.plain)
                .lineLimit(1...6)
                .padding(.horizontal, 14).padding(.vertical, 10)
                .glassSurface(cornerRadius: 18)
                .onSubmit { send() }
            Button { send() } label: {
                Image(systemName: "arrow.up").font(.headline).foregroundStyle(.white).frame(width: 34, height: 34)
                    .background(LinearGradient.wiring, in: Circle())
            }
            .buttonStyle(.plain)
            .keyboardShortcut(.return, modifiers: .command)
            .disabled(text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            .help("Отправить (⌘↵)")
        }
        .padding(14)
    }

    // MARK: data

    private func merge(_ new: [Message]) {
        var byId = Dictionary(uniqueKeysWithValues: messages.map { ($0.id, $0) })
        for m in new { byId[m.id] = m }
        messages = byId.values.sorted { $0.id < $1.id }
        lastId = max(lastId, messages.last?.id ?? 0)
    }

    private func poll(full: Bool) async {
        do {
            let q: [URLQueryItem] = full || lastId == 0 ? [.init(name: "limit", value: "50")] : [.init(name: "after", value: String(lastId))]
            let t = try await API.shared.get(Thread.self, "/api/messages/\(peer.id)", query: q)
            if full && !ready { hasMore = t.hasMore ?? false }
            openers = t.openers ?? []
            let hadNew = !t.messages.isEmpty && (t.messages.last?.id ?? 0) > lastId
            merge(t.messages)
            ready = true
            error = ""
            if hadNew { onActivity() }
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func loadEarlier() async {
        guard let oldest = messages.first?.id else { return }
        do {
            let t = try await API.shared.get(Thread.self, "/api/messages/\(peer.id)", query: [.init(name: "before", value: String(oldest)), .init(name: "limit", value: "50")])
            merge(t.messages)
            hasMore = t.hasMore ?? false
        } catch { self.error = error.localizedDescription }
    }

    private func send() {
        let body = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !body.isEmpty else { return }
        text = ""
        let p = Pending(id: "\(Int(Date().timeIntervalSince1970 * 1000))-\(UUID().uuidString.prefix(8))", body: body)
        pending.append(p)
        Task { await deliver(p) }
    }

    /// Same client id on retry, so the server never stores a duplicate.
    private func deliver(_ p: Pending) async {
        if let i = pending.firstIndex(where: { $0.id == p.id }) { pending[i].failed = false }
        do {
            _ = try await API.shared.raw("/api/messages", method: "POST", json: ["to_id": peer.id, "body": p.body, "client_id": p.id])
            pending.removeAll { $0.id == p.id }
            await poll(full: false)
            onActivity()
        } catch {
            if let i = pending.firstIndex(where: { $0.id == p.id }) { pending[i].failed = true }
            self.error = error.localizedDescription
        }
    }

    private func pickPhoto() {
        let panel = NSOpenPanel()
        panel.allowedContentTypes = [.jpeg, .png, .heic]
        panel.allowsMultipleSelection = false
        guard panel.runModal() == .OK, let url = panel.url else { return }
        sendingPhoto = true
        Task {
            do { try await API.shared.sendPhoto(to: peer.id, file: url); await poll(full: false) }
            catch { self.error = error.localizedDescription }
            sendingPhoto = false
        }
    }
}
