import SwiftUI

/// The compact parent excerpt shown above an inline reply in a Channel or DM.
/// Tapping it asks the owning transcript to reveal the referenced message.
struct InlineReplyPreview: View {
    let reference: MessageReplyReferencePresentation
    let onOpen: () -> Void

    var body: some View {
        Button(action: onOpen) {
            InlineReplyReferenceLabel(reference: reference)
        }
        .buttonStyle(.plain)
        .contentShape(.rect)
        .accessibilityLabel(
            "Jump to \(reference.author.name)'s message: \(reference.excerpt)"
        )
    }
}

/// The same parent excerpt as `InlineReplyPreview`, with the cancel control
/// the composer needs while the user is choosing what to send.
struct InlineReplyComposerReference: View {
    let reference: MessageReplyReferencePresentation
    let onCancel: () -> Void

    var body: some View {
        HStack(alignment: .top, spacing: 8) {
            InlineReplyReferenceLabel(reference: reference)
            Button(action: onCancel) {
                Image(systemName: "xmark")
                    .font(.caption.weight(.semibold))
                    .frame(width: 28, height: 28)
                    .contentShape(.rect)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Cancel reply")
        }
    }
}

private struct InlineReplyReferenceLabel: View {
    let reference: MessageReplyReferencePresentation

    var body: some View {
        HStack(alignment: .top, spacing: 8) {
            Image(systemName: "arrowshape.turn.up.left")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.tint)
                .padding(.top, 1)

            VStack(alignment: .leading, spacing: 1) {
                Text("Replying to \(reference.author.name)")
                    .font(.subheadline.weight(.medium))
                    .lineLimit(1)
                Text(reference.excerpt)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 10)
        .padding(.vertical, 7)
        .background(HausPlatformColor.inputSurface.opacity(0.65))
        .overlay(alignment: .leading) {
            Rectangle()
                .fill(.tint)
                .frame(width: 2)
        }
    }
}
