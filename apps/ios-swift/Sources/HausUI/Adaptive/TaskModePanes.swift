import CoreGraphics

/// Where the detail column puts its panes (specs/ios-app.md, Task mode and
/// Half-open). A Task beside its conversation splits along the fold: side by
/// side when it runs top to bottom, above and below when it runs across,
/// meeting at its midline fully open and keeping 28 pt clear of it half open.
/// With no fold the two split the column evenly side by side, and so they do
/// with the full list leading: the column then starts past where the panes
/// would meet a book fold. A conversation alone keeps to the larger side of an
/// active fold.
public struct TaskModePanes: Equatable, Sendable {
    public let conversation: CGRect
    public let task: CGRect?

    public static func layout(size: CGSize, fold: Fold?, isOpen: Bool, listIsFull: Bool = false) -> TaskModePanes {
        guard isOpen else { return alone(size: size, fold: fold) }
        guard let fold, splits(at: fold, size: size), !(listIsFull && fold.direction == .vertical) else {
            let half = (size.width / 2).rounded(.down)
            return TaskModePanes(
                conversation: CGRect(x: 0, y: 0, width: half, height: size.height),
                task: CGRect(x: half, y: 0, width: size.width - half, height: size.height)
            )
        }
        let end = fold.isActive ? fold.span.lowerBound - Fold.clearance : fold.midline
        let start = fold.isActive ? fold.span.upperBound + Fold.clearance : fold.midline
        let length = fold.length(of: size)
        let lead = 0...min(max(end, 0), length)
        let trail = min(start, length)...max(length, min(start, length))
        return TaskModePanes(
            conversation: rect(lead, in: size, along: fold.direction),
            task: rect(trail, in: size, along: fold.direction)
        )
    }

    /// The frames the layout places its subviews at, conversation first. A
    /// closing Task pane stays a subview for its exit transition, so it keeps
    /// the frame it had open and leaves from there.
    public static func placements(size: CGSize, fold: Fold?, isOpen: Bool, listIsFull: Bool = false) -> [CGRect] {
        let panes = layout(size: size, fold: fold, isOpen: isOpen, listIsFull: listIsFull)
        let leaving = layout(size: size, fold: fold, isOpen: true, listIsFull: listIsFull).task
        return [panes.conversation, panes.task ?? leaving].compactMap(\.self)
    }

    /// A fold running across still splits when the keyboard has shortened the
    /// column to end above it: the Task pane is then under the keyboard.
    private static func splits(at fold: Fold, size: CGSize) -> Bool {
        fold.direction == .horizontal ? fold.span.lowerBound > 0 : fold.divides(size.width)
    }

    private static func alone(size: CGSize, fold: Fold?) -> TaskModePanes {
        guard let fold, fold.direction == .vertical else {
            return TaskModePanes(conversation: CGRect(origin: .zero, size: size), task: nil)
        }
        let side = Fold.clearSide(of: size.width, avoiding: fold)
        return TaskModePanes(conversation: rect(side, in: size, along: .vertical), task: nil)
    }

    private static func rect(_ range: ClosedRange<CGFloat>, in size: CGSize, along direction: Fold.Direction) -> CGRect {
        let length = range.upperBound - range.lowerBound
        switch direction {
        case .vertical: return CGRect(x: range.lowerBound, y: 0, width: length, height: size.height)
        case .horizontal: return CGRect(x: 0, y: range.lowerBound, width: size.width, height: length)
        }
    }
}
