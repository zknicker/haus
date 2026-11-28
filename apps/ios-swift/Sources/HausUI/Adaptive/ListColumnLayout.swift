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

    /// The column after the system's sidebar button sets `visibility`:
    /// hiding the full list hides the column, and showing it from the rail
    /// or hidden brings back the full list.
    public func showing(_ visibility: NavigationSplitViewVisibility) -> ListColumn {
        if visibility == .detailOnly { return self == .full ? .hidden : self }
        return .full
    }
}
