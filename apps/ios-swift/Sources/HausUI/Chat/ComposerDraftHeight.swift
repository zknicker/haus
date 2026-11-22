import SwiftUI

/// How tall the focused composer card stands: sized to its draft, or pulled up to full height by
/// its grabber.
public enum ComposerDraftHeight: Equatable, Sendable {
    case card
    case full

    /// How far a release has to carry the grabber, past where it started, to change state.
    static let settleDistance: CGFloat = 60

    /// Where a grabber drag settles. Upward travel is negative, so pulling the card up past the
    /// settle distance takes it to full height and pushing a full draft down brings it back.
    func settled(predictedTranslation: CGFloat) -> ComposerDraftHeight {
        switch self {
        case .card: predictedTranslation < -Self.settleDistance ? .full : .card
        case .full: predictedTranslation > Self.settleDistance ? .card : .full
        }
    }

    /// The card's height floor while a finger holds the grabber: the height it had when the drag
    /// began, plus however far it has been pulled up.
    static func dragFloor(startHeight: CGFloat, translation: CGFloat) -> CGFloat {
        max(0, startHeight - translation)
    }
}

/// The grabber across the top of the expanded composer card. Dragging it tracks the finger and
/// settles the card at its draft height or full height.
struct ComposerGrabber: View {
    @Binding var draftHeight: ComposerDraftHeight
    /// The live height floor the card lays out against while a drag is in flight.
    @Binding var dragFloor: CGFloat?
    /// The card's control layout height right now, where a new drag starts from.
    let currentHeight: CGFloat

    @State private var dragStartHeight: CGFloat?

    static let zoneHeight: CGFloat = 24

    var body: some View {
        Capsule()
            .fill(HausTone.faintInk.color.opacity(0.5))
            .frame(width: 36, height: 5)
            .frame(maxWidth: .infinity)
            .frame(height: Self.zoneHeight)
            .contentShape(.rect)
            .gesture(drag)
            .accessibilityElement()
            .accessibilityLabel("Draft height")
            .accessibilityValue(draftHeight == .full ? "Full height" : "Fits the draft")
            .accessibilityAdjustableAction { direction in
                withAnimation(ComposerDraftHeight.settleMotion) {
                    draftHeight = direction == .increment ? .full : .card
                }
            }
    }

    private var drag: some Gesture {
        DragGesture(minimumDistance: 4, coordinateSpace: .global)
            .onChanged { value in
                let start = dragStartHeight ?? currentHeight
                dragStartHeight = start
                dragFloor = ComposerDraftHeight.dragFloor(
                    startHeight: start,
                    translation: value.translation.height
                )
            }
            .onEnded { value in
                let settled = draftHeight.settled(
                    predictedTranslation: value.predictedEndTranslation.height
                )
                withAnimation(ComposerDraftHeight.settleMotion) {
                    draftHeight = settled
                    dragFloor = nil
                }
                dragStartHeight = nil
            }
    }
}

extension ComposerDraftHeight {
    static let settleMotion = Animation.spring(response: 0.34, dampingFraction: 0.86)
}
