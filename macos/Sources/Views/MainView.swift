import SwiftUI

struct MainView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        @Bindable var model = model
        NavigationSplitView {
            List(selection: $model.section) {
                ForEach(Section.allCases) { s in
                    Label(s.title, systemImage: s.icon)
                        .badge(s == .chats ? model.unread : s == .likes ? model.likesIn : 0)
                        .tag(s)
                }
            }
            .navigationSplitViewColumnWidth(min: 180, ideal: 210, max: 260)
            .safeAreaInset(edge: .bottom) {
                if let me = model.me {
                    HStack(spacing: 10) {
                        Avatar(path: me.person.photo, name: me.person.name, size: 30)
                        VStack(alignment: .leading, spacing: 0) {
                            Text(me.person.name).font(.callout.weight(.semibold)).lineLimit(1)
                            Text(me.plus ? "WIRING+" : me.email).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                        }
                        Spacer()
                    }
                    .padding(12)
                }
            }
        } detail: {
            switch model.section ?? .feed {
            case .feed: FeedView()
            case .likes: LikesView()
            case .chats: ChatsView()
            case .profile: ProfileView()
            }
        }
    }
}
