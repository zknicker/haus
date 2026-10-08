import Foundation
import HausModels

public enum TaskStatusPresentation: String, Hashable, Sendable {
    case todo = "To do"
    case inProgress = "In progress"
    case inReview = "In review"
    case done = "Done"
    case closed = "Closed"
}

public struct TaskPresentation: Hashable, Sendable {
    public let number: Int
    /// How the task came to exist, which is what Chat's own visibility rule
    /// reads: an Agent's claim is bookkeeping, a human's task is not.
    public let origin: TaskOrigin
    public let status: TaskStatusPresentation
    public let assignee: MessageAuthorPresentation?
    public let creator: MessageAuthorPresentation?

    public init(
        number: Int,
        origin: TaskOrigin = .composed,
        status: TaskStatusPresentation,
        assignee: MessageAuthorPresentation?,
        creator: MessageAuthorPresentation? = nil
    ) {
        self.number = number
        self.origin = origin
        self.status = status
        self.assignee = assignee
        self.creator = creator
    }
}
