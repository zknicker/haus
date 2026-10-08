#if os(iOS)
import UIKit

/// Decides which touches the drawer's pan recognizer may claim.
///
/// The drag starts anywhere on the canvas the moment the finger moves
/// horizontally, so the canvas follows the finger instead of waiting for an
/// edge swipe to complete.
@MainActor
final class DrawerPanDelegate: NSObject, UIGestureRecognizerDelegate {
    /// Whether the drawer is open, read when a drag tries to begin.
    var isOpen: () -> Bool = { false }

    /// Claims only drags that start out horizontal and can move the drawer.
    func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
        guard let pan = gestureRecognizer as? UIPanGestureRecognizer else { return false }
        return DrawerInteraction.accepts(velocity: pan.velocity(in: pan.view), isOpen: isOpen())
    }

    /// Lets the timeline keep tracking until this drag actually begins.
    func gestureRecognizer(
        _ gestureRecognizer: UIGestureRecognizer,
        shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer
    ) -> Bool {
        true
    }

    /// Leaves horizontally scrollable content, such as staged attachments,
    /// alone, and makes every enclosing scroll view wait on this drag.
    ///
    /// The requirement is what locks the axis: a vertical drag fails this
    /// recognizer immediately and scrolling proceeds, while a horizontal one
    /// begins and the scroll view never starts, so later vertical movement
    /// in the same drag cannot scroll the timeline. Re-applying it on every
    /// touch keeps it attached to whichever scroll view SwiftUI currently
    /// has mounted.
    func gestureRecognizer(
        _ gestureRecognizer: UIGestureRecognizer,
        shouldReceive touch: UITouch
    ) -> Bool {
        var candidate = touch.view
        var enclosing: [UIScrollView] = []
        while let view = candidate, view !== gestureRecognizer.view {
            if let scrollView = view as? UIScrollView {
                if scrollView.contentSize.width > scrollView.bounds.width + 1 {
                    return false
                }
                enclosing.append(scrollView)
            }
            candidate = view.superview
        }
        for scrollView in enclosing {
            scrollView.panGestureRecognizer.require(toFail: gestureRecognizer)
        }
        return true
    }
}
#endif
