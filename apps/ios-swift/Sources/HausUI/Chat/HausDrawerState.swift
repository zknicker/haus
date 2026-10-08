import Observation
import SwiftUI

/// What moves the drawer. The UIKit container (`HausDrawerController`) is the
/// only implementation: it owns the canvas's per-frame offset, which never
/// reaches SwiftUI.
@MainActor
protocol HausDrawerMotion: AnyObject {
    /// Springs the drawer to a side from wherever it is now.
    func settle(open: Bool)
}

/// The sidebar drawer's discrete state, shared by the shell and the UIKit
/// container that moves it.
///
/// Nothing here changes per frame. The drag's offset lives in the container as
/// layer properties; this object only hears about the moments a SwiftUI reader
/// cares about — a drag starting, the drawer committing to a side, the sidebar
/// becoming visible or hidden — so a pan frame invalidates no view at all.
@MainActor
@Observable
final class HausDrawerState {
    private(set) var isPresented = false
    /// A finger is on the canvas. True from the drag's first frame until release.
    private(set) var isDragging = false
    /// No sliver of the sidebar is showing. Flips when a drag or settle leaves
    /// zero and when a close lands there.
    private(set) var isSidebarHidden = true
    /// What the current close is, for as long as one is running. Only the veil
    /// reads it, and only a Chat selection ever sets anything else.
    var close = HausDrawerClose.interactive
    /// Called with every settled open or close, inside `settle`, so whatever it
    /// changes — a sidebar re-sort — animates with the drawer.
    @ObservationIgnored var onPresentedChange: (Bool) -> Void = { _ in }
    @ObservationIgnored weak var motion: HausDrawerMotion?

    /// The SwiftUI animation for changes that ride a settle.
    static let settle = Animation.interpolatingSpring(duration: 0.38, bounce: 0.06)

    /// Open, or under a finger: the canvas is no longer the reader's whole screen. The Chat
    /// screen puts its keyboard away the moment this turns true.
    var isEngaged: Bool { isPresented || isDragging }

    func set(open: Bool) {
        // Opening restores the veil. Suppression belongs to the one close a Chat
        // selection starts, and `selectDestination` owns setting it; leaving it
        // to be cleared here keeps a stale suppression from surviving into the
        // next open.
        if open { close = .interactive }
        if let motion {
            motion.settle(open: open)
        } else {
            commit(open: open)
        }
    }

    func toggle() { set(open: !isPresented) }

    // MARK: Reported by the motion

    /// A finger caught the canvas. It is an interactive close whatever ended the
    /// last one, and it is the one path that can reopen the drawer without going
    /// through `set(open:)`.
    func beginDrag() {
        if close != .interactive { close = .interactive }
        if !isDragging { isDragging = true }
    }

    /// The drawer committed to a side: a release, a tap, or a selection.
    /// Returns whether that changed the side, which is when the snap is felt.
    @discardableResult
    func commit(open: Bool) -> Bool {
        if isDragging { isDragging = false }
        guard isPresented != open else { return false }
        isPresented = open
        withAnimation(Self.settle) { onPresentedChange(open) }
        return true
    }

    func setSidebarHidden(_ hidden: Bool) {
        if isSidebarHidden != hidden { isSidebarHidden = hidden }
    }
}

extension EnvironmentValues {
    /// Whether the drawer holding the sidebar is fully shut. The sidebar stays
    /// mounted behind the canvas, so anything in it that animates for its own
    /// sake — the Inbox ghost's drift — freezes while this is true.
    @Entry var hausSidebarHidden = false
    /// Whether the drawer is open or being dragged (`HausDrawerState.isEngaged`). A boolean,
    /// so a pan invalidates its readers only when it starts and ends.
    @Entry var hausDrawerEngaged = false
}
