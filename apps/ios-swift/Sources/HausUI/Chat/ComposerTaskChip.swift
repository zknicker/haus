import SwiftUI

/// The Task the conversation's composer sends to while the Task sits beside
/// it (specs/ios-app.md, One composer).
public struct ComposerTaskChip: Hashable, Sendable {
    public let title: String
    public let disc: TaskDiscState

    public init(title: String, disc: TaskDiscState) {
        self.title = title
        self.disc = disc
    }
}

/// The target chip over the composer: the Task's activity disc, its title,
/// and × to message the conversation instead.
struct ComposerTaskChipView: View {
    let chip: ComposerTaskChip
    let onClear: () -> Void

    var body: some View {
        HStack(spacing: 6) {
            TaskActivityDisc(state: chip.disc, size: 14, surface: HausPlatformColor.canvas)
            Text(chip.title)
                .font(.subheadline.weight(.medium))
                .foregroundStyle(HausPlatformColor.ink)
                .lineLimit(1)
                .truncationMode(.tail)
            Button(action: onClear) {
                Image(systemName: "xmark")
                    .font(.caption2.weight(.bold))
                    .foregroundStyle(HausPlatformColor.mutedInk)
                    .frame(width: 24, height: 24)
                    .contentShape(.circle)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Message the conversation instead")
        }
        .padding(.leading, 10)
        .padding(.trailing, 4)
        .frame(height: 32)
        .glassEffect(.regular, in: .capsule)
        .frame(maxWidth: 280, alignment: .leading)
        .fixedSize(horizontal: false, vertical: true)
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Sending to \(chip.title)")
    }
}
