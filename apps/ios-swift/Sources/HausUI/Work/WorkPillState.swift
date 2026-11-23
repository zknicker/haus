import Foundation

/// Whether a place shows its Work pill, and the count it wears: running
/// Workers plus open pull requests. The pill shows while that count is above
/// zero, or while a Worker settled within the last day, so finished work stays
/// one tap away until it goes stale.
public struct WorkPillState: Hashable, Sendable {
    public let count: Int
    public let isVisible: Bool

    public init(count: Int, isVisible: Bool) {
        self.count = count
        self.isVisible = isVisible
    }

    public init(content: WorkViewContent, now: Date) {
        count = content.running.count + content.pullRequests.count
        isVisible = count > 0 || content.finished.contains { Self.isRecent($0, now: now) }
    }

    public static let recentWindow: TimeInterval = 24 * 60 * 60

    static func isRecent(_ item: WorkWorkerItem, now: Date) -> Bool {
        let settledAt = item.worker.work.terminalAt ?? item.worker.work.updatedAt
        return now.timeIntervalSince(settledAt) < recentWindow
    }
}
