import SwiftUI

extension Color {
    static let wiring = Color(red: 0.427, green: 0.369, blue: 0.988)      // #6D5EFC
    static let wiring2 = Color(red: 0.659, green: 0.471, blue: 1.0)       // #A878FF
    static let like = Color(red: 0.18, green: 0.71, blue: 0.49)
    static let pass = Color(red: 0.90, green: 0.28, blue: 0.30)
}

extension LinearGradient {
    static let wiring = LinearGradient(colors: [.wiring, .wiring2], startPoint: .topLeading, endPoint: .bottomTrailing)
}

extension View {
    /// Liquid Glass on macOS 26+, a material card before that.
    @ViewBuilder
    func glassSurface(cornerRadius: CGFloat = 18) -> some View {
        if #available(macOS 26.0, *) {
            self.glassEffect(.regular, in: .rect(cornerRadius: cornerRadius))
        } else {
            self.background(.regularMaterial, in: RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
        }
    }

    @ViewBuilder
    func glassCircle() -> some View {
        if #available(macOS 26.0, *) {
            self.glassEffect(.regular.interactive(), in: .circle)
        } else {
            self.background(.regularMaterial, in: Circle())
        }
    }

    func card(_ radius: CGFloat = 18) -> some View {
        self.background(Color(nsColor: .controlBackgroundColor), in: RoundedRectangle(cornerRadius: radius, style: .continuous))
            .shadow(color: .black.opacity(0.06), radius: 8, y: 3)
    }
}

struct TagChip: View {
    let text: String
    var selected = false
    var body: some View {
        Text(text)
            .font(.callout.weight(selected ? .semibold : .regular))
            .padding(.horizontal, 10).padding(.vertical, 5)
            .background(selected ? Color.wiring : Color.wiring.opacity(0.10), in: Capsule())
            .foregroundStyle(selected ? Color.white : Color.primary)
    }
}

/// Wrapping layout for chips.
struct FlowLayout: Layout {
    var spacing: CGFloat = 6
    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width ?? 400
        var x: CGFloat = 0, y: CGFloat = 0, row: CGFloat = 0
        for s in subviews {
            let size = s.sizeThatFits(.unspecified)
            if x + size.width > width, x > 0 { x = 0; y += row + spacing; row = 0 }
            x += size.width + spacing; row = max(row, size.height)
        }
        return CGSize(width: width, height: y + row)
    }
    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX, y = bounds.minY, row: CGFloat = 0
        for s in subviews {
            let size = s.sizeThatFits(.unspecified)
            if x + size.width > bounds.maxX, x > bounds.minX { x = bounds.minX; y += row + spacing; row = 0 }
            s.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
            x += size.width + spacing; row = max(row, size.height)
        }
    }
}

struct Avatar: View {
    let path: String?
    let name: String
    var size: CGFloat = 44
    var online = false
    var body: some View {
        ZStack(alignment: .bottomTrailing) {
            Group {
                if path?.isEmpty == false {
                    RemoteImage(path: path)
                } else {
                    Text(String(name.prefix(1)).uppercased()).font(.system(size: size / 2.6, weight: .bold)).foregroundStyle(Color.wiring)
                        .frame(width: size, height: size).background(Color.wiring.opacity(0.12))
                }
            }
            .frame(width: size, height: size).clipShape(Circle())
            if online {
                Circle().fill(Color.like).frame(width: size / 4, height: size / 4)
                    .overlay(Circle().stroke(Color(nsColor: .windowBackgroundColor), lineWidth: 2))
            }
        }
    }
}

struct EmptyState: View {
    let icon: String
    let title: String
    var text: String?
    var body: some View {
        VStack(spacing: 10) {
            Image(systemName: icon).font(.system(size: 40)).foregroundStyle(Color.wiring)
                .frame(width: 84, height: 84).background(Color.wiring.opacity(0.10), in: Circle())
            Text(title).font(.title2.bold())
            if let text { Text(text).foregroundStyle(.secondary).multilineTextAlignment(.center).frame(maxWidth: 360) }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding()
    }
}

func relativeTime(_ ts: Int?) -> String {
    guard let ts, ts > 0 else { return "" }
    let date = Date(timeIntervalSince1970: TimeInterval(ts))
    let f = DateFormatter()
    f.locale = Locale(identifier: "ru_RU")
    f.dateFormat = Calendar.current.isDateInToday(date) ? "HH:mm" : "d MMM"
    return f.string(from: date)
}
