import SwiftUI

/// What a Captain tile's long-press menu offers. Stop comes from the App's
/// `CaptainStopControl`, the same one the DM header and the profile read.
public struct CaptainTileActions {
    let open: (CaptainIdentity) -> Void
    let openProfile: (CaptainIdentity) -> Void
    let openAutomations: (CaptainIdentity) -> Void

    public init(
        open: @escaping (CaptainIdentity) -> Void,
        openProfile: @escaping (CaptainIdentity) -> Void,
        openAutomations: @escaping (CaptainIdentity) -> Void
    ) {
        self.open = open
        self.openProfile = openProfile
        self.openAutomations = openAutomations
    }
}

/// Home's Captains: four equal columns of 63pt marks over 15pt names, each
/// row centered, so two Captains sit in the middle as Capy sets them.
struct CaptainTilesGrid: View {
    let tiles: [CaptainTilePresentation]
    let actions: CaptainTileActions

    @ScaledMetric(relativeTo: .body) private var markSide: CGFloat = 63
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        CenteredColumnsLayout(columns: dynamicTypeSize.isAccessibilitySize ? 2 : 4, spacing: 8, rowSpacing: 20) {
            ForEach(tiles) { tile in
                CaptainTile(tile: tile, side: min(markSide, 96), actions: actions)
            }
        }
        .animation(.snappy, value: tiles)
    }
}

/// Equal-width columns whose rows center, so a short last row sits in the
/// middle instead of against the leading edge.
struct CenteredColumnsLayout: Layout {
    let columns: Int
    let spacing: CGFloat
    let rowSpacing: CGFloat

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width ?? 0
        let heights = rowHeights(subviews: subviews, columnWidth: columnWidth(in: width))
        let totalHeight = heights.reduce(0, +) + rowSpacing * CGFloat(max(heights.count - 1, 0))
        return CGSize(width: width, height: totalHeight)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let columnWidth = columnWidth(in: bounds.width)
        let heights = rowHeights(subviews: subviews, columnWidth: columnWidth)
        var y = bounds.minY
        for (rowIndex, start) in stride(from: 0, to: subviews.count, by: columns).enumerated() {
            let row = subviews[start..<min(start + columns, subviews.count)]
            let rowWidth = CGFloat(row.count) * columnWidth + CGFloat(row.count - 1) * spacing
            var x = bounds.minX + (bounds.width - rowWidth) / 2
            for subview in row {
                subview.place(
                    at: CGPoint(x: x, y: y),
                    anchor: .topLeading,
                    proposal: ProposedViewSize(width: columnWidth, height: nil)
                )
                x += columnWidth + spacing
            }
            y += heights[rowIndex] + rowSpacing
        }
    }

    private func columnWidth(in width: CGFloat) -> CGFloat {
        max((width - spacing * CGFloat(columns - 1)) / CGFloat(columns), 0)
    }

    private func rowHeights(subviews: Subviews, columnWidth: CGFloat) -> [CGFloat] {
        stride(from: 0, to: subviews.count, by: columns).map { start in
            subviews[start..<min(start + columns, subviews.count)]
                .map { $0.sizeThatFits(ProposedViewSize(width: columnWidth, height: nil)).height }
                .max() ?? 0
        }
    }
}

private struct CaptainTile: View {
    let tile: CaptainTilePresentation
    let side: CGFloat
    let actions: CaptainTileActions
    @Environment(\.captainStop) private var captainStop
    @State private var stopTarget: CaptainStopTarget?

    var body: some View {
        Button { actions.open(tile.captain) } label: {
            VStack(spacing: 8) {
                CaptainFaceMark(
                    captain: tile.captain,
                    side: side,
                    isWorking: tile.isWorking,
                    isUnread: tile.isUnread
                )
                Text(tile.captain.name)
                    .font(.subheadline)
                    .foregroundStyle(isActive ? HausPlatformColor.ink : HausPlatformColor.mutedInk)
                    .lineLimit(1)
                    .truncationMode(.tail)
            }
            .frame(maxWidth: .infinity)
            .contentShape(.rect)
        }
        .buttonStyle(.pressable)
        .contextMenu {
            Button("Profile", systemImage: "person.crop.square") { actions.openProfile(tile.captain) }
            Button("Automations", systemImage: "clock.arrow.circlepath") { actions.openAutomations(tile.captain) }
            if let phase = captainStop?.phase(tile.captain.id) {
                let isActionable = CaptainStopCopy.isActionable(phase)
                Button(
                    CaptainStopCopy.title(phase),
                    systemImage: CaptainStopCopy.systemImage(phase),
                    role: isActionable ? .destructive : nil
                ) {
                    stopTarget = CaptainStopTarget(id: tile.captain.id, name: tile.captain.name)
                }
                .disabled(!isActionable)
            }
        }
        .captainStopConfirmation($stopTarget)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(tile.captain.name)
        .accessibilityValue(accessibilityState)
        .accessibilityHint("Opens the DM")
    }

    /// A working Captain, or one with something unread, names itself in ink;
    /// an idle or resting one recedes.
    private var isActive: Bool {
        !tile.isResting && (tile.isWorking || tile.isUnread)
    }

    private var accessibilityState: String {
        [
            tile.isWorking ? "Working" : nil,
            tile.isUnread ? "Unread" : nil,
            tile.isResting ? "Away" : nil,
        ]
        .compactMap(\.self)
        .joined(separator: ", ")
    }
}
