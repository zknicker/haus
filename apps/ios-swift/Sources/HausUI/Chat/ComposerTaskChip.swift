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

/// The composer's leading controls: the plus, then the target chip when the
/// composer sends to a Task. In the pill they lead the field; in the card
/// they lead the controls row under the text.
struct ComposerLeadingControls: View {
    let canAttach: Bool
    let chip: ComposerTaskChip?
    let attachmentFocus: AccessibilityFocusState<Bool>.Binding
    let onAttach: () -> Void
    let onClearChip: () -> Void

    var body: some View {
        HStack(spacing: 6) {
            ComposerCircleButton(icon: .plus, style: .plus(isEnabled: canAttach), label: "Add attachment", action: onAttach)
                .disabled(!canAttach)
                .accessibilityFocused(attachmentFocus)
            if let chip {
                ComposerTaskChipView(chip: chip, onClear: onClearChip)
                    .transition(.scale(scale: 0.8, anchor: .leading).combined(with: .opacity))
            }
        }
    }
}

/// The target chip: the Task's activity disc, its title, and × to message
/// the conversation instead.
private struct ComposerTaskChipView: View {
    static let titleMaxWidth: CGFloat = 110

    let chip: ComposerTaskChip
    let onClear: () -> Void

    var body: some View {
        HStack(spacing: 5) {
            TaskActivityDisc(state: chip.disc, size: 13, surface: HausPlatformColor.fill)
            Text(chip.title)
                .font(.subheadline.weight(.medium))
                .foregroundStyle(HausPlatformColor.ink)
                .lineLimit(1)
                .truncationMode(.tail)
                .frame(maxWidth: Self.titleMaxWidth, alignment: .leading)
            Button(action: onClear) {
                Image(systemName: "xmark")
                    .font(.caption2.weight(.bold))
                    .foregroundStyle(HausPlatformColor.mutedInk)
                    .frame(width: 22, height: 22)
                    .contentShape(.circle)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Message the conversation instead")
        }
        .padding(.leading, 9)
        .padding(.trailing, 3)
        .frame(height: 30)
        .background(HausPlatformColor.fill, in: .capsule)
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Sending to \(chip.title)")
    }
}
