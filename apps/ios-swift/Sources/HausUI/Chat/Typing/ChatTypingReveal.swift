import SwiftUI

/// Opens and closes the typing strip's room above the composer one frame at a
/// time, so the transcript rides it instead of jumping.
///
/// The strip lives in the composer's safe-area inset, and the transcript is a
/// UIKit table that reads that inset as a plain number. A SwiftUI transition
/// alone hands the table only the end height, so the last message would jump
/// by a whole row while the strip faded in. An animatable height re-lays the
/// inset on every frame instead, and the table's inset-only update path keeps
/// a resting transcript pinned to its newest message through each one.
///
/// Reserving the row permanently, as the App does, was the alternative. The
/// phone's transcript is short enough that a row of empty space above every
/// composer costs more than a message gliding up while someone answers.
struct ChatTypingReveal: ViewModifier {
    let isOpen: Bool
    let animation: Animation
    /// The row's natural height, kept after it closes so reopening opens to it.
    @State private var rowHeight: CGFloat = 0

    func body(content: Content) -> some View {
        content
            .fixedSize(horizontal: false, vertical: true)
            .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { height in
                // A collapsing row reports zero as it leaves; keep the last
                // real height for the next opening.
                guard height > 0, height != rowHeight else { return }
                withAnimation(animation) { rowHeight = height }
            }
            .modifier(RevealHeight(height: isOpen ? rowHeight : 0))
    }
}

/// A clipped height SwiftUI interpolates per frame, which is what makes the
/// surrounding layout, and the transcript's inset with it, move every frame.
private struct RevealHeight: ViewModifier, @preconcurrency Animatable {
    var height: CGFloat

    var animatableData: CGFloat {
        get { height }
        set { height = newValue }
    }

    func body(content: Content) -> some View {
        content
            .frame(height: height, alignment: .top)
            .clipped()
    }
}
