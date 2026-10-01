import SwiftUI

/// Entry point. `--selftest` runs an API smoke test against WIRING_API_URL and exits;
/// `--snapshot <dir>` renders the main screens with sample data to PNG files.
@main
enum Main {
    static func main() {
        let args = CommandLine.arguments
        if args.contains("--selftest") { SelfTest.run(); return }
        if let i = args.firstIndex(of: "--snapshot"), i + 1 < args.count { Snapshots.run(into: args[i + 1]); return }
        WiringApp.main()
    }
}

struct WiringApp: App {
    @State private var model = AppModel()

    var body: some Scene {
        WindowGroup("WIRING", id: "main") {
            RootView()
                .environment(model)
                .frame(minWidth: 880, minHeight: 600)
                .task { await model.start() }
        }
        .defaultSize(width: 1180, height: 780)
        .commands { WiringCommands(model: model) }

        Settings {
            SettingsView().environment(model)
        }

        MenuBarExtra {
            MenuBarContent().environment(model)
        } label: {
            Label(model.unread > 0 ? "\(model.unread)" : "WIRING", systemImage: model.unread > 0 ? "bubble.left.fill" : "bolt.heart")
        }
    }
}

struct WiringCommands: Commands {
    let model: AppModel
    var body: some Commands {
        CommandMenu("Навигация") {
            Button("Лента") { model.section = .feed }.keyboardShortcut("1")
            Button("Лайки") { model.section = .likes }.keyboardShortcut("2")
            Button("Чаты") { model.section = .chats }.keyboardShortcut("3")
            Button("Профиль") { model.section = .profile }.keyboardShortcut("4")
        }
    }
}

struct MenuBarContent: View {
    @Environment(AppModel.self) private var model
    @Environment(\.openWindow) private var openWindow
    var body: some View {
        if model.phase == .signedIn {
            Text(model.unread > 0 ? "Непрочитанных: \(model.unread)" : "Новых сообщений нет")
            Text(model.likesIn > 0 ? "Новых лайков: \(model.likesIn)" : "Новых лайков нет")
            Divider()
            Button("Открыть чаты") { model.section = .chats; openWindow(id: "main"); NSApp.activate(ignoringOtherApps: true) }
            Button("Открыть ленту") { model.section = .feed; openWindow(id: "main"); NSApp.activate(ignoringOtherApps: true) }
        } else {
            Button("Открыть WIRING") { openWindow(id: "main"); NSApp.activate(ignoringOtherApps: true) }
        }
        Divider()
        Button("Выйти из WIRING") { NSApp.terminate(nil) }.keyboardShortcut("q")
    }
}
