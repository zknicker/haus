import Foundation
import HausModels
import SwiftUI

/// The Captain whose crew Task opened a pull request.
public struct PullRequestAuthor: Hashable, Sendable {
    public let captainName: String
    public let tint: Color
    /// The Captain itself, when known, so its mark shows its avatar.
    public let captain: CaptainIdentity?

    public init(captainName: String, tint: Color) {
        self.captainName = captainName
        self.tint = tint
        captain = nil
    }

    /// A Captain drawn with its own face, on its stable monogram tint.
    public init(captain: CaptainIdentity) {
        captainName = captain.name
        tint = CaptainTint.color(for: captain.id)
        self.captain = captain
    }

    /// A Captain whose mark wears the accent until it carries its own color.
    public init(captainName: String) {
        self.init(captainName: captainName, tint: HausPlatformColor.accent)
    }

    public var crewLabel: String { "\(captainName)’s crew" }
}

/// The Task a pull request was opened for.
public struct PullRequestTaskLink: Hashable, Sendable {
    public let id: String
    public let title: String
    public let disc: TaskDiscState

    public init(id: String, title: String, disc: TaskDiscState) {
        self.id = id
        self.title = title
        self.disc = disc
    }

    public init(_ task: TaskRecord) {
        self.init(id: task.id, title: task.title, disc: TaskDiscState(task))
    }
}

/// What the place knows about a pull request beyond its GitHub reading.
public struct PullRequestContext: Hashable, Sendable {
    public var author: PullRequestAuthor?
    public var task: PullRequestTaskLink?

    public init(author: PullRequestAuthor? = nil, task: PullRequestTaskLink? = nil) {
        self.author = author
        self.task = task
    }
}

/// Builds a place's pull requests from the readings of its loaded Tasks. A
/// pull request two Tasks read lists once, under the first.
public enum PullRequestCatalog {
    public static func presentations(
        tasks: [TaskDetail],
        captains: [String: PullRequestAuthor]
    ) -> [PullRequestPresentation] {
        var seen = Set<String>()
        return tasks.flatMap { detail in
            detail.pullRequests.compactMap { reading -> PullRequestPresentation? in
                guard seen.insert(reading.id).inserted else { return nil }
                let context = PullRequestContext(
                    author: detail.task.captainID.flatMap { captains[$0] },
                    task: PullRequestTaskLink(detail.task)
                )
                return PullRequestPresentation(reading: reading, context: context)
            }
        }
    }
}
