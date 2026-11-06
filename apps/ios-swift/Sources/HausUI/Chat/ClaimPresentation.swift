import Foundation
import HausModels

public enum ClaimStatusPresentation: String, Hashable, Sendable {
    case todo = "To do"
    case inProgress = "In progress"
    case inReview = "In review"
    case done = "Done"
    case closed = "Closed"
}

public struct ClaimPresentation: Hashable, Sendable {
    public let number: Int
    /// How the claim came to exist, which is what Chat's own visibility rule
    /// reads: an Agent's own claim is bookkeeping, one a human made is not.
    public let origin: ClaimOrigin
    public let status: ClaimStatusPresentation
    public let assignee: MessageAuthorPresentation?
    public let creator: MessageAuthorPresentation?

    public init(
        number: Int,
        origin: ClaimOrigin = .composed,
        status: ClaimStatusPresentation,
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
