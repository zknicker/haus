import CoreGraphics

/// How the detail column splits between a conversation and the Task beside
/// it (specs/ios-app.md, Task mode). Half open like a book, the panes meet at
/// the fold, which neither covers, and each keeps its controls 28 pt clear of
/// it. Otherwise the two split the column evenly.
public struct TaskModePanes: Equatable, Sendable {
    /// Haus's choice, not Apple's.
    public static let foldClearance: CGFloat = 28

    public let conversationWidth: CGFloat
    public let foldWidth: CGFloat
    public let taskWidth: CGFloat
    /// What each pane keeps clear on its edge at the fold.
    public let clearance: CGFloat

    /// - Parameter fold: the division region's span across the column, in the
    ///   column's own coordinates, while the device is half open.
    public static func layout(width: CGFloat, fold: ClosedRange<CGFloat>?) -> TaskModePanes {
        guard let fold, fold.lowerBound > 0, fold.upperBound < width else {
            let half = (width / 2).rounded(.down)
            return TaskModePanes(conversationWidth: half, foldWidth: 0, taskWidth: width - half, clearance: 0)
        }
        return TaskModePanes(
            conversationWidth: fold.lowerBound,
            foldWidth: fold.upperBound - fold.lowerBound,
            taskWidth: width - fold.upperBound,
            clearance: foldClearance
        )
    }
}
