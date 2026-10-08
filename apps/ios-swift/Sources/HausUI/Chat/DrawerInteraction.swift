import CoreGraphics
import Foundation

/// The finger-tracking math behind the sidebar drawer.
///
/// The drawer follows the finger one to one inside its travel, stops at
/// either end, and settles on the side the release actually implies. Keeping
/// this separate from the view keeps the feel testable.
enum DrawerInteraction {
    /// Release speed, in points per second, that decides the drawer on its own.
    static let flickVelocity: CGFloat = 300
    /// Fraction of travel a slow release must pass to open.
    static let openThreshold: CGFloat = 0.5

    /// How far the canvas travels to uncover the sidebar in a container this wide.
    static func width(containerWidth: CGFloat) -> CGFloat {
        max(0, min(containerWidth * 0.82, 340))
    }

    /// Visible canvas offset for an in-progress drag that began with the canvas
    /// at `start` — the resting position, or wherever an interrupted settle had
    /// carried it when the finger caught it.
    ///
    /// Travel stops at both ends rather than stretching: nothing sits behind
    /// the canvas past either edge, so an overdrag would only expose the app
    /// background.
    static func offset(start: CGFloat, translation: CGFloat, width: CGFloat) -> CGFloat {
        guard width > 0 else { return 0 }
        return min(width, max(0, start + translation))
    }

    /// Whether the drawer settles open after a release.
    static func settlesOpen(offset: CGFloat, velocity: CGFloat, width: CGFloat) -> Bool {
        guard width > 0 else { return false }
        if velocity > flickVelocity { return true }
        if velocity < -flickVelocity { return false }
        return offset > width * openThreshold
    }

    /// Gesture velocity expressed in the spring's normalized units.
    ///
    /// UIKit seeds a spring with velocity relative to the distance the animation
    /// covers, so a fast flick over a short remaining distance stays fast.
    static func settleVelocity(velocity: CGFloat, offset: CGFloat, target: CGFloat) -> CGFloat {
        let remaining = target - offset
        guard abs(remaining) > 0.5 else { return 0 }
        return min(max(velocity / remaining, -25), 25)
    }

    /// Whether a drag starting in this state may move the drawer at all.
    static func accepts(velocity: CGPoint, isOpen: Bool) -> Bool {
        guard abs(velocity.x) > abs(velocity.y) else { return false }
        return isOpen ? true : velocity.x > 0
    }
}

/// Everything the drawer draws for one canvas offset. The UIKit container
/// applies it as layer properties — a translation, a corner radius, two
/// alphas, and a clip width — so a frame of drag is never a layout.
struct DrawerGeometry: Equatable {
    /// The canvas's leading edge, from 0 (shut) to `width` (open).
    let offset: CGFloat
    let width: CGFloat

    static let maxCornerRadius: CGFloat = 38
    /// How far behind the canvas the sidebar starts, as a fraction of its width.
    static let parallax: CGFloat = 0.22

    var progress: CGFloat {
        guard width > 0 else { return 0 }
        return min(1, max(0, offset / width))
    }

    var cornerRadius: CGFloat { Self.maxCornerRadius * progress }

    /// The sidebar trails the canvas, closing the gap as the drawer opens.
    var sidebarShift: CGFloat { -(1 - progress) * width * Self.parallax }

    /// The sidebar is clipped to the canvas's leading edge, so nothing of it —
    /// glass included — shows through the canvas's rounded corners.
    var sidebarReveal: CGFloat { min(width, max(0, offset)) }

    /// Any sliver of the sidebar counts as visible, mid-drag included.
    var isSidebarHidden: Bool { progress <= 0 }
}
