import SwiftUI

/// Same options as the web: age, city, meeting format, diagnoses, vibe, hide profiles without a diagnosis.
struct FiltersView: View {
    @Environment(AppModel.self) private var model
    @State var draft: Filters
    let apply: (Filters) -> Void

    init(initial: Filters, apply: @escaping (Filters) -> Void) {
        _draft = State(initialValue: initial)
        self.apply = apply
    }

    private var cities: [String] { (model.catalog?.places ?? []).flatMap(\.cities).sorted() }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Фильтры").font(.title2.bold())
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    HStack {
                        Stepper("Возраст от \(draft.minAge)", value: $draft.minAge, in: 18...draft.maxAge)
                        Stepper("до \(draft.maxAge)", value: $draft.maxAge, in: draft.minAge...99)
                    }
                    Picker("Город", selection: $draft.city) {
                        Text("Любой").tag("")
                        ForEach(cities, id: \.self) { Text($0).tag($0) }
                    }
                    chips("Формат знакомства", model.catalog?.intents, \.intents)
                    chips("Диагнозы", model.catalog?.neuro, \.neuro)
                    Toggle("Скрыть анкеты без диагноза", isOn: $draft.hideUndiagnosed).toggleStyle(.switch)
                    chips("Вайб", model.catalog?.vibe, \.vibe)
                }
            }
            HStack {
                Button("Сбросить") { draft = Filters() }
                Spacer()
                Button("Показать") { apply(draft) }.buttonStyle(.borderedProminent).tint(.wiring).keyboardShortcut(.defaultAction)
            }
        }
        .padding(20)
        .frame(width: 460, height: 560)
        .task { await model.loadCatalog() }
    }

    private func chips(_ title: String, _ items: [CatalogItem]?, _ key: WritableKeyPath<Filters, [String]>) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title.uppercased()).font(.caption.bold()).foregroundStyle(.secondary)
            FlowLayout {
                ForEach(items ?? []) { item in
                    let on = draft[keyPath: key].contains(item.id)
                    Button {
                        if on { draft[keyPath: key].removeAll { $0 == item.id } } else { draft[keyPath: key].append(item.id) }
                    } label: { TagChip(text: item.label ?? item.id, selected: on) }
                    .buttonStyle(.plain)
                }
            }
        }
    }
}

struct SettingsView: View {
    @Environment(AppModel.self) private var model
    @AppStorage("apiURL") private var apiURL = "https://wiring.date"

    var body: some View {
        Form {
            TextField("Сервер", text: $apiURL)
            Text("Для разработки: http://127.0.0.1:5070. Перезапусти приложение после смены сервера.").font(.caption).foregroundStyle(.secondary)
            if model.phase == .signedIn {
                Button("Выйти из аккаунта") { Task { await model.logout() } }
            }
        }
        .padding(20)
        .frame(width: 440)
    }
}
