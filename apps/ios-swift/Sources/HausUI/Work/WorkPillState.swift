import Foundation

/// Whether a place shows its Work pill, and the count it wears: its open pull
/// requests. The pill shows while that count is above zero.
public struct WorkPillState: Hashable, Sendable {
    public let count: Int
    public let isVisible: Bool

    public init(count: Int, isVisible: Bool) {
        self.count = count
        self.isVisible = isVisible
    }

    public init(content: WorkViewContent) {
        count = content.pullRequests.count
        isVisible = count > 0
    }
}
