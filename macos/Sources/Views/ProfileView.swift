import SwiftUI

struct ProfileView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.openURL) private var openURL
    @State private var busy = false
    @State private var error = ""
    @State private var confirmLogout = false

    var body: some View {
        ScrollView {
            if let me = model.me {
                VStack(alignment: .leading, spacing: 18) {
                    header(me)
                    section("Анкета") {
                        row("square.and.pencil", "Редактировать анкету", "Фото, теги, город, о себе") { model.editingProfile = true }
                        row("eye", "Кому показывать мою анкету", "Возраст, откуда, особенности") { model.editingVisibility = true }
                        row("archivebox", "Архив решений", "Лайки, пропуски и блокировки") { open("/archive") }
                    }
                    section("Уведомления") {
                        settingRow("bell", "Уведомления на этом Mac", "Баннер о новых сообщениях, когда окно не активно",
                                   isOn: Binding(get: { model.me?.notifyEnabled ?? false }, set: { v in Task { await setNotifications(v) } }), disabled: busy)
                    }
                    section("О сервисе") {
                        row("checkmark.shield", "Правила", nil) { open("/rules") }
                        row("lock", "Конфиденциальность", nil) { open("/privacy") }
                        row("lifepreserver", "Поддержка", nil) { open("/support") }
                    }
                    section("Аккаунт") {
                        row("rectangle.portrait.and.arrow.right", "Выйти", me.email) { confirmLogout = true }
                        row("trash", "Удалить аккаунт", "На сайте, с подтверждением паролем") { open("/me") }
                    }
                    if !error.isEmpty { Text(error).foregroundStyle(Color.pass) }
                }
                .padding(28)
                .frame(maxWidth: 640)
                .frame(maxWidth: .infinity)
            }
        }
        .navigationTitle("Профиль")
        .sheet(isPresented: Binding(get: { model.editingProfile }, set: { model.editingProfile = $0 })) { EditProfileView().frame(minWidth: 680, idealWidth: 760, minHeight: 640, idealHeight: 820) }
        .sheet(isPresented: Binding(get: { model.editingVisibility }, set: { model.editingVisibility = $0 })) { VisibilityView().frame(minWidth: 620, minHeight: 560, idealHeight: 720) }
        .task { await model.loadCatalog() }
        .confirmationDialog("Выйти из аккаунта?", isPresented: $confirmLogout) {
            Button("Выйти", role: .destructive) { Task { await model.logout() } }
        }
    }

    private func header(_ me: Me) -> some View {
        HStack(spacing: 18) {
            Avatar(path: me.person.photo, name: me.person.name, size: 84)
            VStack(alignment: .leading, spacing: 4) {
                Text(me.person.title).font(.system(size: 28, weight: .heavy))
                Text([me.person.city, me.plus ? "WIRING+" : nil].compactMap { $0?.isEmpty == false ? $0 : nil }.joined(separator: " · "))
                    .foregroundStyle(.white.opacity(0.9))
                if me.needsProfile { Text("Анкета не заполнена — её не видно в ленте").font(.callout.weight(.semibold)) }
            }
            .foregroundStyle(.white)
            Spacer()
        }
        .padding(22)
        .background(LinearGradient.wiring, in: RoundedRectangle(cornerRadius: 26, style: .continuous))
    }

    private func section<Content: View>(_ title: String, @ViewBuilder _ content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title.uppercased()).font(.caption.bold()).foregroundStyle(.secondary)
            VStack(alignment: .leading, spacing: 0) { content() }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 16).padding(.vertical, 6).card()
        }
    }

    private func row(_ icon: String, _ title: String, _ subtitle: String?, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 12) {
                Image(systemName: icon).foregroundStyle(Color.wiring).frame(width: 30, height: 30).background(Color.wiring.opacity(0.1), in: RoundedRectangle(cornerRadius: 8))
                VStack(alignment: .leading, spacing: 1) {
                    Text(title).font(.body.weight(.semibold))
                    if let subtitle { Text(subtitle).font(.caption).foregroundStyle(.secondary) }
                }
                Spacer()
                Image(systemName: "chevron.right").foregroundStyle(.tertiary)
            }
            .padding(.vertical, 8)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private func open(_ path: String) {
        if let url = URL(string: Config.apiURL.absoluteString + path) { openURL(url) }
    }

    /// Both flags sent explicitly so one switch can never flip the other.
    private func setNotifications(_ on: Bool) async {
        busy = true
        do {
            _ = try await API.shared.raw("/api/notifications", method: "PATCH", json: ["enabled": on, "push": on ? (model.me?.notifyPush ?? false) : false])
            await model.refreshMe()
            error = ""
        } catch { self.error = error.localizedDescription }
        busy = false
    }
}
