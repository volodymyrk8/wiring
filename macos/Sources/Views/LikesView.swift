import SwiftUI

struct LikesView: View {
    @Environment(AppModel.self) private var model
    @State private var likes: [Person]?
    @State private var plus = false
    @State private var error = ""
    @State private var selected: Person?
    @State private var showFilters = false

    var body: some View {
        Group {
            if let likes {
                if likes.isEmpty {
                    EmptyState(icon: "heart", title: "Пока никто не лайкнул", text: "Заполни анкету и загляни в ленту. Если включены фильтры, попробуй их сбросить.")
                } else {
                    ScrollView {
                        if !plus {
                            Text("Кто тебя лайкнул — доступно с WIRING+.").foregroundStyle(.secondary).frame(maxWidth: .infinity, alignment: .leading).padding(.horizontal, 24).padding(.top, 16)
                        }
                        LazyVGrid(columns: [GridItem(.adaptive(minimum: 220, maximum: 300), spacing: 18)], spacing: 16) {
                            ForEach(likes) { p in tile(p) }
                        }
                        .padding(24)
                    }
                }
            } else if !error.isEmpty {
                EmptyState(icon: "exclamationmark.triangle", title: "Не загрузилось", text: error)
            } else {
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .navigationTitle("Лайки")
        .toolbar {
            ToolbarItem {
                Button { showFilters = true } label: { Label("Фильтры", systemImage: model.filters.activeCount > 0 ? "line.3.horizontal.decrease.circle.fill" : "line.3.horizontal.decrease.circle") }
                    .popover(isPresented: $showFilters) {
                        FiltersView(initial: model.filters) { f in model.filters = f; showFilters = false; Task { await load() } }
                    }
            }
            ToolbarItem { Button { Task { await load() } } label: { Label("Обновить", systemImage: "arrow.clockwise") }.keyboardShortcut("r") }
        }
        .task { await load() }
        .sheet(item: $selected) { p in PersonView(personId: p.id, initial: p).frame(minWidth: 520, minHeight: 640) }
    }

    private func tile(_ p: Person) -> some View {
        Button { if !p.hidden { selected = p } } label: {
            ZStack(alignment: .bottomLeading) {
                if p.hidden {
                    VStack(spacing: 6) { Image(systemName: "lock.fill"); Text("WIRING+").bold() }.foregroundStyle(Color.wiring)
                        .frame(maxWidth: .infinity, maxHeight: .infinity).background(Color.wiring.opacity(0.1))
                } else {
                    RemoteImage(path: p.photo)
                    LinearGradient(colors: [.clear, .black.opacity(0.7)], startPoint: .center, endPoint: .bottom)
                    Text(p.title).font(.headline).foregroundStyle(.white).padding(12)
                }
            }
            .aspectRatio(0.78, contentMode: .fit)
            .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
            .shadow(color: .black.opacity(0.1), radius: 8, y: 3)
        }
        .buttonStyle(.plain)
    }

    private func load() async {
        do {
            let page = try await API.shared.get(LikesPage.self, "/api/likes", query: model.filters.queryItems)
            likes = page.likes
            plus = page.plus
            error = ""
        } catch {
            self.error = error.localizedDescription
        }
    }
}
