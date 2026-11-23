/// Whether a tab root's scrolling has folded the bottom chrome: scrolling
/// down a list folds it, and scrolling back up or reaching the top unfolds
/// it. Each fold waits for `travel` points in one direction, so a finger
/// resting on the list never flickers it.
public struct BottomChromeScroll: Equatable, Sendable {
    public private(set) var isCollapsed = false
    /// The turning point of the current run: the lowest offset while
    /// unfolded, the highest while folded.
    private var anchor: Double?

    public static let travel = 24.0

    public init() {}

    /// How far a list has scrolled from its top, clamped to the range it can
    /// rest in so a rubber band at either end reads as no movement.
    public static func distance(offset: Double, topInset: Double, bottomInset: Double, content: Double, container: Double) -> Double {
        let limit = max(content + topInset + bottomInset - container, 0)
        return min(max(offset + topInset, 0), limit)
    }

    public mutating func scroll(from old: Double, to new: Double) {
        guard new > 0 else {
            self = BottomChromeScroll()
            return
        }
        let start = anchor ?? old
        if isCollapsed {
            let highest = max(start, new)
            isCollapsed = highest - new < Self.travel
            anchor = isCollapsed ? highest : new
        } else {
            let lowest = min(start, new)
            isCollapsed = new - lowest >= Self.travel
            anchor = isCollapsed ? new : lowest
        }
    }

    public mutating func expand() {
        self = BottomChromeScroll()
    }
}
