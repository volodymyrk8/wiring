import SwiftUI

struct RootView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        Group {
            if model.upgradeRequired {
                EmptyState(icon: "arrow.down.circle", title: "Нужно обновление", text: "Эта версия WIRING больше не поддерживается. Установи новую версию.")
            } else {
                switch model.phase {
                case .loading: ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
                case .signedOut: LoginView()
                case .signedIn: MainView()
                }
            }
        }
    }
}

struct LoginView: View {
    @Environment(AppModel.self) private var model
    @State private var email = ""
    @State private var password = ""
    @State private var error = ""
    @State private var busy = false

    var body: some View {
        HStack(spacing: 0) {
            ZStack(alignment: .bottomLeading) {
                LinearGradient.wiring
                VStack(alignment: .leading, spacing: 10) {
                    Image(systemName: "bolt.fill").font(.system(size: 30, weight: .bold)).foregroundStyle(.white)
                        .frame(width: 60, height: 60).background(.white.opacity(0.22), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                    Text("WIRING").font(.system(size: 46, weight: .black)).foregroundStyle(.white).kerning(3)
                    Text("Знакомства для нейроотличных.\nВ своём ритме.").font(.title3).foregroundStyle(.white.opacity(0.9))
                }
                .padding(44)
            }
            .frame(minWidth: 360, maxWidth: 480)

            VStack(alignment: .leading, spacing: 16) {
                Text("Вход").font(.largeTitle.bold())
                Text("Тот же аккаунт, что на сайте и в телефоне.").foregroundStyle(.secondary)
                VStack(alignment: .leading, spacing: 10) {
                    TextField("Почта", text: $email).textContentType(.username).textFieldStyle(.roundedBorder).controlSize(.large)
                    SecureField("Пароль", text: $password).textContentType(.password).textFieldStyle(.roundedBorder).controlSize(.large)
                        .onSubmit { Task { await submit() } }
                }
                if !error.isEmpty { Text(error).foregroundStyle(Color.pass) }
                Button {
                    Task { await submit() }
                } label: {
                    HStack { if busy { ProgressView().controlSize(.small) }; Text("Войти").bold() }.frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent).tint(.wiring).controlSize(.large)
                .keyboardShortcut(.defaultAction)
                .disabled(email.isEmpty || password.isEmpty || busy)
                Link("Нет аккаунта? Зарегистрироваться на wiring.date", destination: Config.apiURL)
                    .font(.callout)
            }
            .frame(maxWidth: 380)
            .padding(48)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }

    private func submit() async {
        busy = true
        error = ""
        do { try await model.login(email: email, password: password) } catch { self.error = error.localizedDescription }
        busy = false
    }
}
