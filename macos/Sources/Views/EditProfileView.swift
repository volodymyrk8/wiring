import SwiftUI
import UniformTypeIdentifiers

/// City (or country) picker with search; used by the editor, visibility settings and filters.
struct PlacePicker: View {
    let places: [Place]
    var includeCountries = false
    var anyLabel: String?
    @Binding var selection: String
    @State private var query = ""
    @State private var open = false

    private var rows: [(String, String)] {
        let all = places.flatMap { p in (includeCountries ? [(p.country, "вся страна")] : []) + p.cities.map { ($0, p.country) } }
        let q = query.trimmingCharacters(in: .whitespaces).lowercased()
        return q.isEmpty ? all : all.filter { $0.0.lowercased().contains(q) || $0.1.lowercased().contains(q) }
    }

    var body: some View {
        Button { open = true } label: {
            HStack {
                Text(selection.isEmpty ? (anyLabel ?? "Выбрать") : selection).foregroundStyle(selection.isEmpty ? .secondary : .primary)
                Image(systemName: "chevron.up.chevron.down").font(.caption).foregroundStyle(.secondary)
            }
        }
        .popover(isPresented: $open, arrowEdge: .bottom) {
            VStack(spacing: 0) {
                TextField("Поиск", text: $query).textFieldStyle(.roundedBorder).padding(10)
                List {
                    if let anyLabel {
                        Button(anyLabel) { selection = ""; open = false }.foregroundStyle(Color.wiring)
                    }
                    ForEach(rows, id: \.0) { row in
                        Button { selection = row.0; open = false } label: {
                            HStack { Text(row.0); Spacer(); Text(row.1).foregroundStyle(.secondary).font(.caption) }.contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            .frame(width: 320, height: 380)
        }
    }
}

/// Chip multi-select bound to a list of ids.
struct ChipPicker: View {
    let items: [CatalogItem]
    @Binding var selection: [String]
    var single = false
    var body: some View {
        FlowLayout {
            ForEach(items) { item in
                let on = selection.contains(item.id)
                Button {
                    if single { selection = [item.id] }
                    else if on { selection.removeAll { $0 == item.id } }
                    else { selection.append(item.id) }
                } label: { TagChip(text: item.label ?? item.id, selected: on) }
                .buttonStyle(.plain)
            }
        }
    }
}

struct FormSection<Content: View>: View {
    let title: String
    @ViewBuilder var content: Content
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title.uppercased()).font(.caption.bold()).foregroundStyle(.secondary)
            VStack(alignment: .leading, spacing: 12) { content }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(16)
                .card()
        }
    }
}

struct EditProfileView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss

    @State private var name = ""
    @State private var age = ""
    @State private var gender: [String] = []
    @State private var lookingFor: [String] = []
    @State private var intents: [String] = []
    @State private var city = ""
    @State private var job = ""
    @State private var bio = ""
    @State private var neuro: [String] = []
    @State private var vibe: [String] = []
    @State private var specialConsent = true
    @State private var photoConsent = true
    @State private var loaded = false
    @State private var saving = false
    @State private var uploading = false
    @State private var error = ""
    @State private var info = ""

    private var hardMissing: [String] {
        var m: [String] = []
        if name.trimmingCharacters(in: .whitespaces).count < 2 { m.append("имя (2–32 символа)") }
        if !(18...99).contains(Int(age) ?? 0) { m.append("возраст 18–99") }
        if gender.isEmpty { m.append("пол") }
        if lookingFor.isEmpty { m.append("кого ищешь") }
        return m
    }
    private var softMissing: [String] {
        var m: [String] = []
        if city.isEmpty { m.append("город") }
        if neuro.isEmpty { m.append("хотя бы одна особенность") }
        if !neuro.isEmpty && !specialConsent { m.append("согласие показывать особенности") }
        return m
    }

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Text("Моя анкета").font(.title2.bold())
                Spacer()
                Button("Отмена") { dismiss() }.keyboardShortcut(.cancelAction)
                Button { Task { await save() } } label: {
                    HStack { if saving { ProgressView().controlSize(.small) }; Text(softMissing.isEmpty || !hardMissing.isEmpty ? "Сохранить" : "Сохранить черновик") }
                }
                .buttonStyle(.borderedProminent).tint(.wiring).keyboardShortcut("s").disabled(saving)
            }
            .padding(16)
            Divider()
            if let me = model.me, let catalog = model.catalog {
                ScrollView {
                    VStack(alignment: .leading, spacing: 20) {
                        photos(me)
                        FormSection(title: "Основное") {
                            HStack(spacing: 12) {
                                LabeledContent("Имя") { TextField("Имя", text: $name).textFieldStyle(.roundedBorder) }
                                LabeledContent("Возраст") { TextField("18+", text: $age).textFieldStyle(.roundedBorder).frame(width: 70) }
                            }
                            Text("Пол").foregroundStyle(.secondary)
                            ChipPicker(items: catalog.genders ?? [], selection: $gender, single: true)
                            Text("Кого ищешь").foregroundStyle(.secondary)
                            ChipPicker(items: catalog.lookingFor ?? [], selection: $lookingFor, single: true)
                            Text("Что ищешь").foregroundStyle(.secondary)
                            ChipPicker(items: catalog.intents ?? [], selection: $intents)
                            HStack {
                                Text("Город").foregroundStyle(.secondary)
                                PlacePicker(places: catalog.places ?? [], selection: $city)
                                Spacer()
                            }
                            LabeledContent("Чем занимаешься") { TextField("Например, дизайн", text: $job).textFieldStyle(.roundedBorder) }
                        }
                        FormSection(title: "О себе") {
                            TextEditor(text: $bio)
                                .font(.body)
                                .frame(minHeight: 120)
                                .scrollContentBackground(.hidden)
                                .padding(6)
                                .background(Color(nsColor: .textBackgroundColor), in: RoundedRectangle(cornerRadius: 8))
                            Text("\(bio.count)/1200").font(.caption).foregroundStyle(bio.count > 1200 ? Color.pass : .secondary)
                        }
                        FormSection(title: "Особенности (минимум одна)") { ChipPicker(items: catalog.neuro ?? [], selection: $neuro) }
                        FormSection(title: "Вайб") { ChipPicker(items: catalog.vibe ?? [], selection: $vibe) }
                        FormSection(title: "Согласия") {
                            settingRow("cross.case", "Показывать выбранные особенности", "Это данные о здоровье. Без согласия анкета не попадёт в ленту.", isOn: $specialConsent)
                            settingRow("camera", "Загружаю только свои фото", "Нужно для загрузки фотографий.", isOn: $photoConsent)
                        }
                        if !hardMissing.isEmpty || !softMissing.isEmpty {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(hardMissing.isEmpty ? "Сохранится как черновик. Для ленты добавь:" : "Нужно заполнить, чтобы сохранить:").bold()
                                Text((hardMissing + softMissing).joined(separator: " · ")).foregroundStyle(.secondary)
                            }
                            .frame(maxWidth: .infinity, alignment: .leading).padding(14).card()
                        }
                        if !error.isEmpty { Text(error).foregroundStyle(Color.pass) }
                        if !info.isEmpty { Text(info).foregroundStyle(Color.like) }
                    }
                    .padding(24)
                    .frame(maxWidth: 720)
                    .frame(maxWidth: .infinity)
                }
                .onAppear { if !loaded { fill(me); loaded = true } }
            } else {
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity).task { await model.loadCatalog() }
            }
        }
    }

    // MARK: photos

    private func photos(_ me: Me) -> some View {
        FormSection(title: "Фото") {
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 130, maximum: 170), spacing: 12)], spacing: 12) {
                ForEach(me.photoItems) { p in
                    ZStack(alignment: .topTrailing) {
                        RemoteImage(path: p.url).aspectRatio(0.8, contentMode: .fit).clipShape(RoundedRectangle(cornerRadius: 14))
                        Button { Task { await deletePhoto(p.id) } } label: { Image(systemName: "xmark").font(.caption.bold()).frame(width: 24, height: 24) }
                            .buttonStyle(.plain).foregroundStyle(.white).background(.black.opacity(0.55), in: Circle()).padding(6).help("Удалить фото")
                        VStack { Spacer(); HStack {
                            Button(p.isPrimary ? "Главное" : "Сделать главным") { if !p.isPrimary { Task { await makePrimary(p.id) } } }
                                .buttonStyle(.plain).font(.caption.bold()).foregroundStyle(.white)
                                .padding(.horizontal, 8).padding(.vertical, 3)
                                .background(p.isPrimary ? Color.wiring : Color.black.opacity(0.55), in: Capsule())
                            Spacer()
                        } }.padding(6)
                    }
                }
                if me.photoItems.count < 12 {
                    Button { addPhoto() } label: {
                        RoundedRectangle(cornerRadius: 14)
                            .fill(Color.wiring.opacity(0.08))
                            .aspectRatio(0.8, contentMode: .fit)
                            .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(Color.wiring, style: StrokeStyle(lineWidth: 2, dash: [6])))
                            .overlay {
                                VStack(spacing: 6) {
                                    Image(systemName: uploading ? "hourglass" : "plus").font(.title)
                                    Text("Добавить").font(.caption)
                                }
                                .foregroundStyle(Color.wiring)
                            }
                    }
                    .buttonStyle(.plain).disabled(uploading)
                }
            }
            Text("Можно перетащить фото из Finder на кнопку «Добавить» или выбрать файл.").font(.caption).foregroundStyle(.secondary)
        }
        .dropDestination(for: URL.self) { urls, _ in
            guard let url = urls.first else { return false }
            Task { await upload(url) }
            return true
        }
    }

    private func addPhoto() {
        let panel = NSOpenPanel()
        panel.allowedContentTypes = [.jpeg, .png, .heic]
        panel.allowsMultipleSelection = false
        guard panel.runModal() == .OK, let url = panel.url else { return }
        Task { await upload(url) }
    }

    private func upload(_ url: URL) async {
        guard photoConsent else { error = "Включи «Загружаю только свои фото»."; return }
        uploading = true
        do { try await API.shared.uploadProfilePhoto(file: url); await model.refreshMe(); error = "" }
        catch { self.error = error.localizedDescription }
        uploading = false
    }

    private func makePrimary(_ id: Int) async {
        do { _ = try await API.shared.raw("/api/photos/\(id)", method: "PATCH", json: ["is_primary": true]); await model.refreshMe() }
        catch { self.error = error.localizedDescription }
    }

    private func deletePhoto(_ id: Int) async {
        do { _ = try await API.shared.raw("/api/photos/\(id)", method: "DELETE"); await model.refreshMe() }
        catch { self.error = error.localizedDescription }
    }

    // MARK: save

    private func fill(_ me: Me) {
        name = me.person.name
        age = me.person.age.map(String.init) ?? ""
        gender = me.gender.isEmpty ? [] : [me.gender]
        lookingFor = me.lookingFor.isEmpty ? [] : [me.lookingFor]
        intents = me.person.intents.isEmpty ? ["dating"] : me.person.intents
        city = (me.person.city == "—" ? "" : me.person.city) ?? ""
        job = me.person.job ?? ""
        bio = me.person.bio ?? ""
        neuro = me.person.neuro
        vibe = me.person.vibe
        specialConsent = !me.needsSpecialConsent
        photoConsent = !me.needsPhotoConsent
    }

    private func save() async {
        if !hardMissing.isEmpty { error = "Заполни: \(hardMissing.joined(separator: ", "))."; return }
        saving = true
        error = ""
        info = ""
        let asDraft = !softMissing.isEmpty
        var body: [String: Any] = [
            "name": name.trimmingCharacters(in: .whitespaces), "age": Int(age) ?? 0, "gender": gender.first ?? "",
            "looking_for": lookingFor.first ?? "", "intents": intents, "city": city, "job": job.trimmingCharacters(in: .whitespaces),
            "bio": bio.trimmingCharacters(in: .whitespacesAndNewlines), "neuro": neuro, "vibe": vibe,
            "special_data_consent": specialConsent, "photo_rights_consent": photoConsent,
        ]
        if asDraft { body["draft"] = true }
        do {
            _ = try await API.shared.send(SaveResponse.self, "/api/me", method: "PATCH", json: body)
            await model.refreshMe()
            if asDraft { info = "Сохранено как черновик. Для ленты добавь: \(softMissing.joined(separator: ", "))." }
            else { dismiss() }
        } catch {
            self.error = error.localizedDescription
        }
        saving = false
    }
}

/// Settings row in the profile style: icon, title, subtitle and a switch on the right.
func settingRow(_ icon: String, _ title: String, _ subtitle: String?, isOn: Binding<Bool>, disabled: Bool = false) -> some View {
    HStack(spacing: 12) {
        Image(systemName: icon).foregroundStyle(Color.wiring).frame(width: 30, height: 30).background(Color.wiring.opacity(0.1), in: RoundedRectangle(cornerRadius: 8))
        VStack(alignment: .leading, spacing: 1) {
            Text(title).font(.body.weight(.semibold))
            if let subtitle { Text(subtitle).font(.caption).foregroundStyle(.secondary) }
        }
        Spacer(minLength: 12)
        Toggle(title, isOn: isOn).labelsHidden().toggleStyle(.switch).disabled(disabled)
    }
    .padding(.vertical, 8)
}

/// "Кому показывать мою анкету": saved as a partial (draft) PATCH, like on the web and phone.
struct VisibilityView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var minAge = 18
    @State private var maxAge = 99
    @State private var place = ""
    @State private var hidden: [String] = []
    @State private var loaded = false
    @State private var saving = false
    @State private var error = ""

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Text("Кому показывать мою анкету").font(.title2.bold())
                Spacer()
                Button("Отмена") { dismiss() }.keyboardShortcut(.cancelAction)
                Button("Сохранить") { Task { await save() } }.buttonStyle(.borderedProminent).tint(.wiring).keyboardShortcut("s").disabled(saving)
            }
            .padding(16)
            Divider()
            if let me = model.me, let catalog = model.catalog {
                ScrollView {
                    VStack(alignment: .leading, spacing: 20) {
                        Text("Анкету увидят только люди, подходящие под эти условия. Ты сам по-прежнему видишь всех по своим фильтрам.").foregroundStyle(.secondary)
                        FormSection(title: "Возраст и место") {
                            HStack {
                                Stepper("От \(minAge)", value: $minAge, in: 18...maxAge)
                                Stepper("до \(maxAge)", value: $maxAge, in: minAge...99)
                            }
                            HStack {
                                Text("Откуда").foregroundStyle(.secondary)
                                PlacePicker(places: catalog.places ?? [], includeCountries: true, anyLabel: "Отовсюду", selection: $place)
                                Spacer()
                            }
                        }
                        FormSection(title: "Не показывать меня людям с этими особенностями") { ChipPicker(items: catalog.neuro ?? [], selection: $hidden) }
                        FormSection(title: "Не показывать меня людям с таким вайбом") { ChipPicker(items: catalog.vibe ?? [], selection: $hidden) }
                        if !error.isEmpty { Text(error).foregroundStyle(Color.pass) }
                    }
                    .padding(24)
                    .frame(maxWidth: 720)
                    .frame(maxWidth: .infinity)
                }
                .onAppear {
                    if !loaded { minAge = me.seekMinAge; maxAge = me.seekMaxAge; place = me.seekPlace; hidden = me.hideTags; loaded = true }
                }
            } else {
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity).task { await model.loadCatalog() }
            }
        }
    }

    private func save() async {
        saving = true
        do {
            _ = try await API.shared.send(SaveResponse.self, "/api/me", method: "PATCH", json: [
                "draft": true, "seek_min_age": minAge, "seek_max_age": maxAge, "seek_place": place, "hide_tags": hidden,
            ])
            await model.refreshMe()
            dismiss()
        } catch { self.error = error.localizedDescription }
        saving = false
    }
}
