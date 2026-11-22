import CoreGraphics

extension HausRadius {
    /// A Captain mark's corner: a fixed share of its side, so the squircle is
    /// the same shape at every size.
    static func captain(side: CGFloat) -> CGFloat {
        side * CaptainMarkGeometry.cornerRatio
    }
}

/// Every measurement of a Captain mark, derived from its side.
///
/// The mocks draw the mark at 63pt; each part is that drawing's measurement
/// as a share of 63, so a 24pt row mark is the 63pt tile scaled down.
struct CaptainMarkGeometry: Equatable, Sendable {
    static let cornerRatio: CGFloat = 0.22
    private static let reference: CGFloat = 63

    let side: CGFloat

    var cornerRadius: CGFloat { HausRadius.captain(side: side) }
    var initialSize: CGFloat { side * 0.42 }

    /// The working badge: a dark tab tucked into the bottom-trailing corner.
    var badgeSide: CGFloat { scaled(22) }
    var badgeCornerRadius: CGFloat { scaled(9) }
    var badgeDot: CGFloat { scaled(3) }
    var badgeDotGap: CGFloat { scaled(2.5) }

    /// The unread dot overhangs the top-trailing corner, ringed in the canvas.
    var unreadDiameter: CGFloat { scaled(13) }
    var unreadRing: CGFloat { scaled(3) }
    var unreadOverhang: CGFloat { scaled(3) }

    private func scaled(_ measurement: CGFloat) -> CGFloat {
        side * measurement / Self.reference
    }
}
