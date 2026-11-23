import SwiftUI

/// The portal card's box: how big it is in each mode, where it sits in the container, and what it
/// has to become for its collapse to land inside the composer's attachment tile.
struct ComposerPortalGeometry {
    let overlay: ComposerOverlay?
    let availableSize: CGSize
    /// The composer shell's rect in window coordinates, which the source menu centres on.
    let composerFrame: CGRect?

    /// The card's inset from the display on the sides and on the floor, and the collapse measures
    /// from it, so it is geometry rather than padding.
    ///
    /// One number for all three edges because the media card's corners nest concentrically inside
    /// the display's, and concentric nesting is only *uniform* when the inset is: the inner radius
    /// is the outer radius minus the distance to it, so an 8pt floor under 12pt sides would round
    /// the bottom corners 4pt harder than the sides and read as a card sitting slightly askew in
    /// the bezel.
    static let nestingInset: CGFloat = 12
    /// The plus button's centre measured in from the composer shell's leading edge: the shell's own
    /// 6pt inset plus half the 36pt circle.
    private static let plusCenterInset: CGFloat = 24
    /// The plus button's centre measured up from the composer shell's bottom edge: the shell's 6pt
    /// bottom padding plus half the 36pt controls row.
    private static let plusCenterLift: CGFloat = 24

    private var isSourceMenu: Bool { overlay == .sources }

    /// The media card's radius: an approximation of the display's rounding minus `nestingInset`.
    /// A number, not a concentric *shape*, on purpose — SwiftUI resolves `.concentric` against
    /// settled layout rather than each animated frame, which left the corner square for the whole
    /// menu-to-media morph, and iOS 26 offers no public way to read the resolved concentric value
    /// back (a UIKit `containerConcentric` probe reports `layer.cornerRadius` 0; the direct
    /// `GeometryProxy.concentricCornerRadii` arrives in iOS 27).
    static let mediaCornerRadius: CGFloat = 44

    /// The radius the card animates on: the menu-to-media morph interpolates this alongside the
    /// frame, so the corner travels with the card instead of arriving after it.
    var cornerRadius: CGFloat { isSourceMenu ? 30 : Self.mediaCornerRadius }

    var width: CGFloat {
        isSourceMenu
            ? min(286, availableSize.width - 32)
            : availableSize.width - (Self.nestingInset * 2)
    }

    var height: CGFloat {
        isSourceMenu ? 210 : min(520, max(390, availableSize.height * 0.58))
    }

    var size: CGSize { CGSize(width: width, height: height) }

    /// The source menu pops off the plus and sits over the composer it came from; the media portals
    /// are full-bleed cards that sit on the container floor the way the reference does.
    var bottomPadding: CGFloat {
        guard isSourceMenu, let composerFrame else { return Self.nestingInset }
        return Self.sourceMenuBottomPadding(
            composerFrame: composerFrame,
            containerHeight: availableSize.height,
            menuHeight: height
        )
    }

    var origin: CGPoint {
        CGPoint(x: Self.nestingInset, y: availableSize.height - bottomPadding - height)
    }

    /// How far past the composer's bottom edge the centred menu may sink while a keyboard holds
    /// the floor — about one key row, matching the reference's card resting on the keys. The card
    /// draws in a window above the keyboard's, so the overlap renders instead of being covered.
    private static let keyboardOverlapAllowance: CGFloat = 56
    /// Below this much space under the composer there is no keyboard, only the screen floor.
    private static let keyboardPresenceThreshold: CGFloat = 100

    /// Centres the menu on the composer's input so the card reads as growing out of it. With a
    /// keyboard up the card may sink one key row past the composer, the way the reference rests on
    /// the keys; with the keyboard down that same sink would run off the screen floor, so the
    /// composer's own bottom edge is the limit. Never so high that a tall draft or a full
    /// attachment strip pushes the card off the top.
    static func sourceMenuBottomPadding(
        composerFrame: CGRect,
        containerHeight: CGFloat,
        menuHeight: CGFloat
    ) -> CGFloat {
        let keyboardHoldsTheFloor =
            containerHeight - composerFrame.maxY > keyboardPresenceThreshold
        let lowestAllowed =
            composerFrame.maxY + (keyboardHoldsTheFloor ? keyboardOverlapAllowance : 0)
        let menuBottom = min(lowestAllowed, composerFrame.midY + (menuHeight / 2))
        let highestAllowed = max(nestingInset, containerHeight - menuHeight - nestingInset)
        return min(max(nestingInset, containerHeight - menuBottom), highestAllowed)
    }

    /// The plus button's centre in the card's own unit space, so the menu pops out of the control
    /// that opened it instead of out of a corner that happens to be near it.
    var popAnchor: UnitPoint {
        guard let composerFrame, width > 0, height > 0 else { return .bottomLeading }
        let box = CGRect(origin: origin, size: size)
        return UnitPoint(
            x: unit(composerFrame.minX + Self.plusCenterInset - box.minX, in: width),
            y: unit(composerFrame.maxY - Self.plusCenterLift - box.minY, in: height)
        )
    }

    func collapseScale(landing: CGRect?) -> CGSize {
        guard let landing, width > 0, height > 0 else { return CGSize(width: 1, height: 1) }
        return CGSize(width: landing.width / width, height: landing.height / height)
    }

    func collapseOffset(landing: CGRect?) -> CGSize {
        guard let landing else { return .zero }
        return CGSize(width: landing.minX - origin.x, height: landing.minY - origin.y)
    }

    private func unit(_ distance: CGFloat, in extent: CGFloat) -> CGFloat {
        min(max(distance / extent, 0), 1)
    }
}
