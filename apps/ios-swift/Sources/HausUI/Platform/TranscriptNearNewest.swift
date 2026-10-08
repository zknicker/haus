import CoreGraphics

/// Whether the transcript is showing its newest item, and when that answer is
/// allowed to be published.
///
/// The threshold is the easy half. The publishing rule is the load-bearing one:
/// a landing transcript passes through intermediate geometry inside a single
/// runloop turn — an inset grows before the resting offset is reapplied, an
/// append jumps the viewport before releasing it toward rest — and any of those
/// mid-turn readings describes a viewport that is about to rest on the newest
/// row. Only settled geometry is a reading, and a reading is published only when
/// it differs from the value this transcript last published.
struct TranscriptNearNewest {
    /// Points from the resting (newest) edge still counted as showing the
    /// newest item.
    static let tolerance: CGFloat = 80

    static func isNear(distance: CGFloat, tolerance: CGFloat = tolerance) -> Bool {
        distance < tolerance
    }

    /// The value the view currently holds. A transcript opens on its newest
    /// item, so nothing is published for a first paint that lands there.
    private(set) var reported = true

    /// Whether a programmatic settle toward the newest edge is in flight. Its
    /// destination is the answer; the offsets it travels through are not.
    private(set) var isSettling = false

    /// Whether the transcript counts as showing its newest item. A settling
    /// transcript is heading to that item, so it counts as near for the inset
    /// anchor and the append policy no matter which offset it is passing
    /// through — mid-travel geometry describes where it came from.
    func countsAsNear(distance: CGFloat) -> Bool {
        isSettling || Self.isNear(distance: distance)
    }

    /// Identifies one settle. A settle is closed by its travel arriving home
    /// (`TranscriptSettleTravel`) or by anything that takes the viewport away
    /// from it. Whichever comes first closes it; a later close carrying a
    /// superseded ticket is ignored, so it cannot close the settle that
    /// replaced this one.
    struct SettleTicket: Equatable, Sendable {
        fileprivate let generation: Int
    }

    private var generation = 0

    /// Opens a settle. The transcript reads as showing its newest item from
    /// here until the returned ticket is redeemed, or until an unconditional
    /// `endSettling` takes the viewport back.
    mutating func beginSettling() -> SettleTicket {
        generation &+= 1
        isSettling = true
        return SettleTicket(generation: generation)
    }

    /// Closes the settle this ticket opened, and spends the ticket: a settle
    /// closes exactly once. Returns whether this call is the one that closed
    /// it — a superseded or already-spent ticket changes nothing, and its
    /// caller skips the reading it would have published too.
    @discardableResult
    mutating func endSettling(_ ticket: SettleTicket) -> Bool {
        guard ticket.generation == generation else { return false }
        generation &+= 1
        isSettling = false
        return true
    }

    /// Ends any settle in flight and orphans every ticket outstanding — a drag
    /// taking the viewport, or a snap that jumps straight to the newest edge.
    mutating func endSettling() {
        generation &+= 1
        isSettling = false
    }

    /// Records one settled reading. Returns the value to publish, or `nil` when
    /// the reading matches what the view already holds.
    mutating func settle(distance: CGFloat) -> Bool? {
        let near = countsAsNear(distance: distance)
        guard near != reported else { return nil }
        reported = near
        return near
    }
}
