import SwiftUI

/// The person's message in the assistant layout: their words in a filled
/// bubble that hugs the text and never runs past `TranscriptTrailingColumn`.
struct MessageBubble: View {
    let blocks: [RichMessageBlock]

    static let cornerRadius: CGFloat = 18
    static let verticalPadding: CGFloat = 10
    static let horizontalPadding: CGFloat = 13

    var body: some View {
        RichMessageContentView(blocks: blocks)
            .padding(.vertical, Self.verticalPadding)
            .padding(.horizontal, Self.horizontalPadding)
            .background(
                HausPlatformColor.bubble,
                in: .rect(cornerRadius: Self.cornerRadius, style: .continuous)
            )
    }
}

/// Lays its one child against the trailing edge at the child's own width,
/// capped to a share of the row, the way a sent message sits in a chat.
///
/// The child's ideal width is its unwrapped width, so a short message hugs its
/// words and a long one wraps at the cap.
struct TranscriptTrailingColumn: Layout {
    static let widthFraction: CGFloat = 0.76

    nonisolated static func width(ideal: CGFloat, available: CGFloat) -> CGFloat {
        max(0, min(ideal, available * widthFraction))
    }

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        guard let child = subviews.first else { return .zero }
        guard let available = proposal.width, available.isFinite else {
            return child.sizeThatFits(.unspecified)
        }
        let width = Self.width(ideal: child.sizeThatFits(.unspecified).width, available: available)
        let height = child.sizeThatFits(ProposedViewSize(width: width, height: nil)).height
        return CGSize(width: available, height: height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        guard let child = subviews.first else { return }
        let width = Self.width(ideal: child.sizeThatFits(.unspecified).width, available: bounds.width)
        child.place(
            at: CGPoint(x: bounds.maxX - width, y: bounds.minY),
            anchor: .topLeading,
            proposal: ProposedViewSize(width: width, height: bounds.height)
        )
    }
}

extension HausTone {
    /// The person's message bubble.
    static let bubble = HausTone(dark: HausSwatch(0x222224), light: HausSwatch(0xEBEBEE))
}

extension HausPlatformColor {
    static var bubble: Color { HausTone.bubble.color }
}
