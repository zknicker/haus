import SwiftUI

/// The parent line that leads an inline reply's identity block in a Channel or
/// DM: an elbow in the avatar rail, then the parent author's small avatar, name,
/// and a one-line excerpt. Tapping it asks the owning transcript to reveal the
/// referenced message. Mirrors the App's `InlineReplyPreview`.
struct InlineReplyPreview: View {
    let reference: MessageReplyReferencePresentation
    let onOpen: () -> Void
    @ScaledMetric(relativeTo: .footnote) private var avatarSize: CGFloat = 18

    var body: some View {
        Button(action: onOpen) {
            HStack(spacing: 0) {
                InlineReplyElbow()
                    .frame(width: InlineReplyElbow.railWidth)
                HStack(spacing: 6) {
                    AvatarView(
                        name: reference.author.name,
                        url: reference.author.avatarURL,
                        size: avatarSize
                    )
                    Text(reference.author.name)
                        .fontWeight(.medium)
                        .layoutPriority(1)
                    Text(reference.excerpt)
                }
                .font(.footnote)
                .foregroundStyle(.secondary)
                .lineLimit(1)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(
            "Jump to \(reference.author.name)'s message: \(reference.excerpt)"
        )
    }
}

/// The quiet "Replying to Name" line above the composer input, with the
/// cancel control the composer needs while the user is choosing what to send.
struct InlineReplyComposerReference: View {
    let reference: MessageReplyReferencePresentation
    let onCancel: () -> Void

    var body: some View {
        HStack(spacing: 8) {
            Text("Replying to \(authorName)")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .lineLimit(1)
                .frame(maxWidth: .infinity, alignment: .leading)
                .accessibilityLabel("Replying to \(reference.author.name): \(reference.excerpt)")
            Button(action: onCancel) {
                Image(systemName: "xmark")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                    .frame(width: 28, height: 28)
                    .contentShape(.rect)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Cancel reply")
        }
        .padding(.leading, 12)
    }

    private var authorName: Text {
        Text(reference.author.name)
            .fontWeight(.semibold)
            .foregroundStyle(HausPlatformColor.label)
    }
}

/// The rounded corner that climbs from the reply's avatar toward its parent
/// line. Spans the avatar rail: the 38pt avatar plus the row's 11pt gutter.
private struct InlineReplyElbow: View {
    static let railWidth: CGFloat = 49
    private static let avatarCenter: CGFloat = 19
    private static let radius: CGFloat = 8

    var body: some View {
        GeometryReader { geometry in
            let midY = geometry.size.height / 2
            let x = Self.avatarCenter
            Path { path in
                path.move(to: CGPoint(x: x, y: geometry.size.height + 2))
                path.addLine(to: CGPoint(x: x, y: midY + Self.radius))
                path.addQuadCurve(
                    to: CGPoint(x: x + Self.radius, y: midY),
                    control: CGPoint(x: x, y: midY)
                )
                path.addLine(to: CGPoint(x: Self.railWidth - 6, y: midY))
            }
            .stroke(HausPlatformColor.separator, style: StrokeStyle(lineWidth: 2, lineCap: .round))
        }
        .accessibilityHidden(true)
    }
}
