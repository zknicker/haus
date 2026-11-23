import SwiftUI

/// One icon in the tab bar. A missing `image` falls back to the symbol.
public struct HausTabBarItem<Tab: Hashable>: Identifiable {
    public let tab: Tab
    public let label: String
    public let systemImage: String
    public let image: Image?

    public init(_ tab: Tab, label: String, systemImage: String, image: Image? = nil) {
        self.tab = tab
        self.label = label
        self.systemImage = systemImage
        self.image = image
    }

    public var id: Tab { tab }
}

/// The bottom chrome measured from Capy: a 49pt glass capsule of icon-only
/// tabs, with the "Ask anything" field 9pt above it when there is one.
public struct HausBottomChrome<Tab: Hashable>: View {
    @Binding private var selection: Tab
    private let items: [HausTabBarItem<Tab>]
    private let onAsk: (() -> Void)?

    public static var barHeight: CGFloat { 49 }
    public static var accessoryHeight: CGFloat { 47 }
    public static var gap: CGFloat { 9 }

    public init(selection: Binding<Tab>, items: [HausTabBarItem<Tab>], onAsk: (() -> Void)?) {
        _selection = selection
        self.items = items
        self.onAsk = onAsk
    }

    public var body: some View {
        GlassEffectContainer(spacing: Self.gap) {
            VStack(spacing: Self.gap) {
                if let onAsk {
                    AskAnythingAccessory(action: onAsk)
                        .frame(height: Self.accessoryHeight)
                        .glassEffect(.regular.interactive(), in: .capsule)
                }
                HausTabBar(selection: $selection, items: items)
            }
        }
        .padding(.horizontal, 21)
    }
}

struct HausTabBar<Tab: Hashable>: View {
    @Binding var selection: Tab
    let items: [HausTabBarItem<Tab>]
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        HStack(spacing: 0) {
            ForEach(items) { item in
                Button { selection = item.tab } label: { cell(item) }
                    .buttonStyle(.plain)
                    .accessibilityLabel(item.label)
                    .accessibilityAddTraits(item.tab == selection ? .isSelected : [])
            }
        }
        .padding(.horizontal, 3)
        .frame(height: HausBottomChrome<Tab>.barHeight)
        .glassEffect(.regular, in: .capsule)
    }

    private func cell(_ item: HausTabBarItem<Tab>) -> some View {
        let isSelected = item.tab == selection
        return icon(item, isSelected: isSelected)
            .frame(maxWidth: .infinity)
            .frame(height: 42)
            .background {
                if isSelected {
                    Capsule().fill(.black.opacity(colorScheme == .dark ? 0.45 : 0.07))
                }
            }
            .contentShape(Capsule())
    }

    @ViewBuilder
    private func icon(_ item: HausTabBarItem<Tab>, isSelected: Bool) -> some View {
        if let image = item.image {
            image
                .resizable()
                .frame(width: 26, height: 26)
                .clipShape(Circle())
                .overlay {
                    if isSelected {
                        Circle().stroke(HausPlatformColor.accent, lineWidth: 2).padding(-2)
                    }
                }
        } else {
            Image(systemName: item.systemImage)
                .font(.system(size: 19, weight: .medium))
                .foregroundStyle(isSelected ? HausPlatformColor.accent : HausPlatformColor.label)
        }
    }
}
