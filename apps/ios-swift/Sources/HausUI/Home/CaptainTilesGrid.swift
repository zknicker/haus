import SwiftUI

/// What a Captain tile's long-press menu offers. Stop is a slot the shell
/// fills once Captains can be stopped from here.
public struct CaptainTileActions {
    let open: (CaptainIdentity) -> Void
    let openProfile: (CaptainIdentity) -> Void
    let openAutomations: (CaptainIdentity) -> Void
    let stop: ((CaptainIdentity) -> Void)?

    public init(
        open: @escaping (CaptainIdentity) -> Void,
        openProfile: @escaping (CaptainIdentity) -> Void,
        openAutomations: @escaping (CaptainIdentity) -> Void,
        stop: ((CaptainIdentity) -> Void)? = nil
    ) {
        self.open = open
        self.openProfile = openProfile
        self.openAutomations = openAutomations
        self.stop = stop
    }
}

/// Home's Captains: a centered four-column grid of 63pt marks over 17pt names.
struct CaptainTilesGrid: View {
    let tiles: [CaptainTilePresentation]
    let actions: CaptainTileActions

    @ScaledMetric(relativeTo: .body) private var markSide: CGFloat = 63
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        LazyVGrid(columns: columns, alignment: .center, spacing: 20) {
            ForEach(tiles) { tile in
                CaptainTile(tile: tile, side: min(markSide, 96), actions: actions)
            }
        }
        .animation(.snappy, value: tiles)
    }

    private var columns: [GridItem] {
        Array(
            repeating: GridItem(.flexible(), spacing: 8, alignment: .top),
            count: dynamicTypeSize.isAccessibilitySize ? 2 : 4
        )
    }
}

private struct CaptainTile: View {
    let tile: CaptainTilePresentation
    let side: CGFloat
    let actions: CaptainTileActions

    var body: some View {
        Button { actions.open(tile.captain) } label: {
            VStack(spacing: 10) {
                CaptainFaceMark(
                    captain: tile.captain,
                    side: side,
                    isWorking: tile.isWorking,
                    isUnread: tile.isUnread
                )
                Text(tile.captain.name)
                    .font(.body)
                    .foregroundStyle(tile.isResting ? HausPlatformColor.mutedInk : HausPlatformColor.ink)
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
            if let stop = actions.stop, tile.isWorking {
                Button("Stop", systemImage: "stop.circle", role: .destructive) { stop(tile.captain) }
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(tile.captain.name)
        .accessibilityValue(accessibilityState)
        .accessibilityHint("Opens the DM")
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
