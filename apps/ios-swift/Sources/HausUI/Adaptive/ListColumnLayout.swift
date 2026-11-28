import HausModels
import SwiftUI

/// How wide a split tab's list column draws in each state, and how a drag
/// on its edge handle and the system's sidebar button move it between them.
public enum ListColumnLayout {
    public static let railWidth: CGFloat = 76
    /// The edge handle's width, on the column's trailing edge.
    public static let handleWidth: CGFloat = 12
    /// A drag released narrower than this leaves the full list for the rail.
    public static let railSnapWidth: CGFloat = 160
    /// A drag released narrower than this hides the column.
    public static let hideSnapWidth: CGFloat = 40
    public static let fullMinimumWidth: CGFloat = 270
    public static let fullIdealWidth: CGFloat = 330
    public static let fullMaximumWidth: CGFloat = 360

    /// The column once a drag on its edge handle lets go at `width`: hidden
    /// below 40 pt, the rail below 160 pt, else the full list. A tab without
    /// a rail keeps its full list where another would take the rail.
    public static func released(at width: CGFloat, hasRail: Bool) -> ListColumn {
        if width < hideSnapWidth { return .hidden }
        if width < railSnapWidth, hasRail { return .rail }
        return .full
    }

    /// Half open like a book with no Task beside the conversation, the full
    /// list reaches the fold, so list and detail are the two pages. Nil when
    /// the fold is inactive, runs across, or leaves less than a full list.
    public static func foldedWidth(fold: Fold?, width: CGFloat, besideTask: Bool) -> CGFloat? {
        guard !besideTask, let fold, fold.isActive, fold.direction == .vertical, fold.divides(width),
              fold.span.lowerBound >= fullMinimumWidth
        else { return nil }
        return fold.span.lowerBound
    }

    /// Half open like a book beside a Task: the panes must meet at the fold,
    /// so the list stays aside (`TaskModeColumn`).
    public static func pinsTaskModeAside(fold: Fold?, width: CGFloat, besideTask: Bool) -> Bool {
        guard besideTask, let fold else { return false }
        return fold.isActive && fold.direction == .vertical && fold.divides(width)
    }

    /// Where the edge handle's grip and touch area go: the whole edge, or the
    /// larger side of an active fold running across it.
    public static func handleSpan(height: CGFloat, fold: Fold?) -> ClosedRange<CGFloat> {
        Fold.clearSide(of: height, avoiding: fold?.direction == .horizontal ? fold : nil)
    }
}

extension ListColumn {
    /// The state a tab draws. A tab without a rail shows its full list.
    public func shown(hasRail: Bool) -> ListColumn {
        self == .rail && !hasRail ? .full : self
    }

    /// The system's column shows only the full list. The rail draws beside
    /// the detail, inside its column, so the system column is hidden for it.
    public var visibility: NavigationSplitViewVisibility {
        self == .full ? .all : .detailOnly
    }
}
