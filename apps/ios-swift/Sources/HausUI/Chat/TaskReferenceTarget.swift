import Foundation
import HausModels

/// A Task reference's id, read from its wire form `task://<taskId>` — the shared
/// contract's `parseTaskReferenceTarget`.
public struct TaskReferenceTarget: Hashable, Sendable {
    public let taskID: String

    public init(taskID: String) {
        self.taskID = taskID
    }

    /// Reads a tapped link back into a Task, for the text view's coordinator.
    public init?(url: URL) {
        let prefix = "task://"
        let target = url.absoluteString
        guard target.hasPrefix(prefix) else { return nil }
        let raw = String(target.dropFirst(prefix.count))
        let taskID = raw.removingPercentEncoding ?? raw
        guard !taskID.isEmpty else { return nil }
        self.init(taskID: taskID)
    }

    /// The in-app address a chip carries as its link.
    public var url: URL? {
        taskID.addingPercentEncoding(withAllowedCharacters: .urlHostAllowed)
            .flatMap { URL(string: "task://\($0)") }
    }
}
