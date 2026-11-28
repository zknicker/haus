import Foundation
import HausModels

/// A Task chat's header: the Task's title and its disc. Its pull requests and
/// files live in the Work view.
public struct TaskChatHeaderPresentation: Hashable, Sendable {
    public let shortID: String
    public let title: String
    public let disc: TaskDiscState

    public init(shortID: String, title: String, disc: TaskDiscState) {
        self.shortID = shortID
        self.title = title
        self.disc = disc
    }

    public init(_ task: TaskRecord) {
        self.init(shortID: task.shortID, title: task.title, disc: TaskDiscState(task))
    }
}

public struct TaskStartedFromPresentation: Hashable, Sendable {
    public let placeLabel: String
    public let excerpt: String?

    public init(placeLabel: String, excerpt: String?) {
        self.placeLabel = placeLabel
        self.excerpt = excerpt
    }

    public var title: String { "Started from \(placeLabel)" }
}
