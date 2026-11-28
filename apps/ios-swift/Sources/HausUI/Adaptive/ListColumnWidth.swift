import CoreGraphics

/// The width Haus asks the system's list column for. Fully open it asks for
/// nothing fixed, and the system draws its own width, which the reader can
/// drag. Half open like a book it fixes the column at the fold. The system
/// keeps a column's width when the range around it changes, so opening the
/// Duo again fixes the column back at the width it had before the fold until
/// the system draws it there, then lets go.
public struct ListColumnWidth: Equatable, Sendable {
    public private(set) var folded: CGFloat?
    private var restoring: CGFloat?
    private var open: CGFloat?

    public init() {}

    /// The fixed width to ask for, or nil for the system's own range.
    public var fixed: CGFloat? {
        folded ?? restoring
    }

    public mutating func fold(to width: CGFloat?) {
        if folded != nil, width == nil { restoring = open ?? ListColumnLayout.fullMinimumWidth }
        folded = width
    }

    /// The column's drawn width, whenever it changes. The system never draws
    /// narrower than its own floor, so a width within a few points of the one
    /// asked for counts as reached.
    public mutating func measured(_ width: CGFloat) {
        guard folded == nil, width >= ListColumnLayout.railSnapWidth else { return }
        if let restoring {
            if width <= restoring + Self.reachTolerance { self.restoring = nil }
            return
        }
        open = width
    }

    private static let reachTolerance: CGFloat = 12
}
