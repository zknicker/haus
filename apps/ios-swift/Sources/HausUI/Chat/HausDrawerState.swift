import Observation
import SwiftUI

/// The sidebar drawer's state, held outside the shell's body.
///
/// A drag rewrites `dragTranslation` on every frame. Kept as shell `@State`,
/// each of those writes re-ran the whole shell body and rebuilt the Chat
/// screen with fresh closures, so SwiftUI could never skip it mid-pan. As an
/// observable object, only the small frame views that actually read the
/// geometry (`HausDrawerSidebarFrame`, `HausDrawerCanvasFrame`) are
/// invalidated per frame; the shell body never reads it.
@MainActor
@Observable
final class HausDrawerState {
    private(set) var isPresented = false
    private(set) var dragTranslation: CGFloat?
    /// What the current close is, for as long as one is running. Only the veil
    /// reads it, and only a Chat selection ever sets anything else.
    var close = HausDrawerClose.interactive
    /// Called with every settled open or close, inside the drawer's own
    /// animation, so whatever it changes — a sidebar re-sort — animates with it.
    @ObservationIgnored var onPresentedChange: (Bool) -> Void = { _ in }

    static let settle = Animation.interpolatingSpring(duration: 0.38, bounce: 0.06)

    func offset(width: CGFloat) -> CGFloat {
        guard let dragTranslation else { return isPresented ? width : 0 }
        return DrawerInteraction.offset(isOpen: isPresented, translation: dragTranslation, width: width)
    }

    func progress(width: CGFloat) -> CGFloat {
        guard width > 0 else { return 0 }
        return min(1, max(0, offset(width: width) / width))
    }

    func cornerRadius(width: CGFloat) -> CGFloat {
        38 * progress(width: width)
    }

    func handle(_ pan: DrawerPan, width: CGFloat) {
        switch pan {
        case .changed(let translation):
            // A finger on the canvas is an interactive close whatever ended the
            // last one, and it is the one path that can reopen the drawer
            // without going through `set(open:)`.
            if close != .interactive { close = .interactive }
            dragTranslation = translation
        case .ended(let translation, let velocity):
            let offset = DrawerInteraction.offset(isOpen: isPresented, translation: translation, width: width)
            let opens = DrawerInteraction.settlesOpen(offset: offset, velocity: velocity, width: width)
            let settleVelocity = DrawerInteraction.settleVelocity(
                velocity: velocity,
                offset: offset,
                target: opens ? width : 0
            )
            withAnimation(.interpolatingSpring(duration: 0.38, bounce: 0.06, initialVelocity: settleVelocity)) {
                dragTranslation = nil
                settle(open: opens)
            }
        }
    }

    func set(open: Bool) {
        // Opening restores the veil. Suppression belongs to the one close a Chat
        // selection starts, and `selectDestination` owns setting it; leaving it
        // to be cleared here keeps a stale suppression from surviving into the
        // next open.
        if open { close = .interactive }
        withAnimation(Self.settle) {
            dragTranslation = nil
            settle(open: open)
        }
    }

    private func settle(open: Bool) {
        guard isPresented != open else { return }
        isPresented = open
        onPresentedChange(open)
    }

    func toggle() { set(open: !isPresented) }
}

extension EnvironmentValues {
    /// Whether the drawer holding the sidebar is fully shut. The sidebar stays
    /// mounted behind the canvas, so anything in it that animates for its own
    /// sake — the Inbox ghost's drift — freezes while this is true. Set by the
    /// sidebar frame, so only readers whose answer flips are invalidated.
    @Entry var hausSidebarHidden = false
}
