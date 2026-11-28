import SwiftUI

/// A list column at rail width (specs/ios-app.md, iPhone Duo): compose at
/// the top, the tab's marks between, and the button that brings back the
/// full list at the bottom, which the split chooses (`\.revealListColumn`).
public struct ListRail<Target: Hashable & Sendable>: View {
    private let items: [ListRailItem<Target>]
    private let onCompose: (() -> Void)?
    private let onSelect: (Target) -> Void

    @Environment(\.revealListColumn) private var reveal

    public init(
        items: [ListRailItem<Target>],
        onCompose: (() -> Void)?,
        onSelect: @escaping (Target) -> Void
    ) {
        self.items = items
        self.onCompose = onCompose
        self.onSelect = onSelect
    }

    public var body: some View {
        FoldReader { size, fold in
            VStack(spacing: RailSize.spacing) {
                if let onCompose {
                    ListRailButton(title: "Ask anything", systemImage: "square.and.pencil", tint: HausPlatformColor.accentInk, action: onCompose)
                    Capsule()
                        .fill(HausPlatformColor.hairline)
                        .frame(width: 28, height: 1)
                }
                ScrollView {
                    LazyVStack(spacing: RailSize.spacing) {
                        ForEach(items) { item in
                            ListRailMark(item: item) { onSelect(item.target) }
                        }
                    }
                    .padding(.vertical, 2)
                }
                .scrollIndicators(.hidden)
                .padding(.bottom, ListRailFold.gap(height: size.height, fold: fold))
                ListRailButton(title: "Show list", systemImage: "sidebar.leading", tint: HausPlatformColor.mutedInk) { reveal?() }
            }
            .padding(.top, ListRailFold.topPadding)
            .padding(.bottom, ListRailFold.bottomPadding)
        }
        .frame(width: ListColumnLayout.railWidth)
        .frame(maxHeight: .infinity)
        .background(HausPlatformColor.canvas.ignoresSafeArea())
    }
}

/// Half open on a surface the fold runs across the rail: its marks scroll
/// above the fold and Show list waits below it, each 28 pt clear.
enum ListRailFold {
    static let topPadding: CGFloat = 12
    static let bottomPadding: CGFloat = 16

    /// The room under the marks' scroll view that leaves the fold, and the
    /// clearance either side of it, empty.
    static func gap(height: CGFloat, fold: Fold?) -> CGFloat {
        guard let fold, fold.isActive, fold.direction == .horizontal, fold.divides(height) else { return 0 }
        let marksEnd = height - bottomPadding - RailSize.slot - RailSize.spacing
        return max(marksEnd - (fold.span.lowerBound - Fold.clearance), 0)
    }
}

enum RailSize {
    static let spacing: CGFloat = 10
    static let slot: CGFloat = 48
    static let side: CGFloat = 44
}

private struct ListRailButton: View {
    let title: String
    let systemImage: String
    let tint: Color
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Label(title, systemImage: systemImage)
                .labelStyle(.iconOnly)
                .font(.system(size: 20))
                .foregroundStyle(tint)
                .frame(width: RailSize.slot, height: RailSize.slot)
                .contentShape(.rect)
        }
        .buttonStyle(.plain)
    }
}

/// One mark at 44 pt in a 48 pt slot. The selected slot takes the list's
/// selection tint and a 4 pt indicator on the rail's leading edge.
private struct ListRailMark<Target: Hashable & Sendable>: View {
    let item: ListRailItem<Target>
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            mark
                .frame(width: RailSize.side, height: RailSize.side)
                .overlay(alignment: .topTrailing) { badge.offset(x: 3, y: -3) }
                .frame(width: RailSize.slot, height: RailSize.slot)
                .listSelection(item.isSelected)
                .overlay(alignment: .leading) {
                    if item.isSelected { indicator }
                }
                .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(item.label)
        .accessibilityValue(accessibilityValue)
    }

    @ViewBuilder
    private var mark: some View {
        switch item.mark {
        case .captain(let captain):
            CaptainFaceMark(captain: captain, side: RailSize.side)
        case .person(let name, let avatarURL):
            AvatarView(name: name, url: avatarURL, size: RailSize.side)
        case .project(let appearance):
            ChannelIconBox(appearance: appearance, size: RailSize.side)
        case .task(let state):
            tile { TaskActivityDisc(state: state, size: 20, surface: HausPlatformColor.fill) }
        case .icon(let name):
            tile {
                HausIcon(name, size: 20, weight: 1.8)
                    .foregroundStyle(item.isSelected ? HausPlatformColor.ink : HausPlatformColor.mutedInk)
            }
        }
    }

    private func tile(@ViewBuilder _ glyph: () -> some View) -> some View {
        glyph()
            .frame(width: RailSize.side, height: RailSize.side)
            .background(HausPlatformColor.fill, in: .haus(HausRadius.mark(side: RailSize.side)))
    }

    @ViewBuilder
    private var badge: some View {
        if let badge = item.badge {
            Circle()
                .fill(badge == .unread ? HausPlatformColor.accent : HausPlatformColor.positive)
                .frame(width: 11, height: 11)
                .padding(2.5)
                .background(HausPlatformColor.canvas, in: Circle())
        }
    }

    private var indicator: some View {
        UnevenRoundedRectangle(bottomTrailingRadius: 3, topTrailingRadius: 3, style: .continuous)
            .fill(HausPlatformColor.ink)
            .frame(width: 4, height: 24)
            .offset(x: -(ListColumnLayout.railWidth - RailSize.slot) / 2)
    }

    private var accessibilityValue: String {
        switch item.badge {
        case .unread: "Unread"
        case .working: "Working"
        case nil: ""
        }
    }
}
