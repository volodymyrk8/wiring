import SwiftUI

struct PersonView: View {
    let personId: Int
    var initial: Person?
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var person: Person?
    @State private var page = 0
    @State private var error = ""
    @State private var confirmBlock = false
    @State private var info = ""

    private static let reasons: [(String, String)] = [
        ("spam", "Спам / реклама"), ("fake", "Фейк или чужие фото"), ("harassment", "Домогательство / угрозы"),
        ("underage", "Похоже, нет 18"), ("other", "Другое"),
    ]

    var body: some View {
        let p = person ?? initial
        VStack(spacing: 0) {
            HStack {
                Text(p?.title ?? "Профиль").font(.title2.bold())
                Spacer()
                Button("Готово") { dismiss() }.keyboardShortcut(.cancelAction)
            }
            .padding(16)
            Divider()
            if let p {
                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        photos(p)
                        if !p.subtitle.isEmpty { Text(p.subtitle).font(.title3).foregroundStyle(.secondary) }
                        if let bio = p.bio, !bio.isEmpty { Text(bio).font(.body).textSelection(.enabled).padding(14).frame(maxWidth: .infinity, alignment: .leading).card() }
                        tags("Особенности", p.neuro)
                        tags("Вайб", p.vibe)
                        tags("Что ищет", p.intents)
                        actions(p)
                        if !info.isEmpty { Text(info).foregroundStyle(Color.like) }
                        if !error.isEmpty { Text(error).foregroundStyle(Color.pass) }
                    }
                    .padding(20)
                }
            } else {
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .task {
            do { person = try await API.shared.get(PersonResponse.self, "/api/people/\(personId)").person }
            catch { self.error = error.localizedDescription }
        }
        .confirmationDialog("Заблокировать?", isPresented: $confirmBlock) {
            Button("Заблокировать", role: .destructive) { Task { await block() } }
        } message: { Text("Человек исчезнет из ленты и чатов.") }
    }

    private func photos(_ p: Person) -> some View {
        let list = p.photos.isEmpty ? [p.photo ?? ""] : p.photos
        return ZStack(alignment: .top) {
            RemoteImage(path: list[min(page, list.count - 1)])
                .aspectRatio(0.85, contentMode: .fit)
                .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
            if list.count > 1 {
                HStack {
                    Button { page = max(0, page - 1) } label: { Image(systemName: "chevron.left").frame(width: 34, height: 34) }.buttonStyle(.plain).glassCircle()
                    Spacer()
                    Text("\(page + 1)/\(list.count)").font(.caption.bold()).padding(.horizontal, 10).padding(.vertical, 4).glassSurface(cornerRadius: 10)
                    Spacer()
                    Button { page = min(list.count - 1, page + 1) } label: { Image(systemName: "chevron.right").frame(width: 34, height: 34) }.buttonStyle(.plain).glassCircle()
                }
                .padding(12)
            }
        }
    }

    @ViewBuilder private func tags(_ title: String, _ ids: [String]) -> some View {
        if !ids.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                Text(title.uppercased()).font(.caption.bold()).foregroundStyle(.secondary)
                FlowLayout { ForEach(ids, id: \.self) { TagChip(text: model.label($0)) } }
            }
        }
    }

    private func actions(_ p: Person) -> some View {
        HStack {
            if p.matched {
                Button { dismiss(); model.openChatId = p.id; model.section = .chats } label: { Label("Написать", systemImage: "bubble.left.fill") }
                    .buttonStyle(.borderedProminent).tint(.wiring)
            }
            Menu {
                ForEach(Self.reasons, id: \.0) { r in Button(r.1) { Task { await report(r.0) } } }
            } label: { Label("Пожаловаться", systemImage: "flag") }
                .fixedSize()
            Button(role: .destructive) { confirmBlock = true } label: { Label("Заблокировать", systemImage: "nosign") }
        }
        .controlSize(.large)
    }

    private func report(_ reason: String) async {
        do { _ = try await API.shared.raw("/api/report", method: "POST", json: ["user_id": personId, "reason": reason]); info = "Жалоба отправлена, мы её рассмотрим."; error = "" }
        catch { self.error = error.localizedDescription }
    }

    private func block() async {
        do { _ = try await API.shared.raw("/api/block", method: "POST", json: ["user_id": personId]); dismiss() }
        catch { self.error = error.localizedDescription }
    }
}
