import Foundation
import HausModels

extension CloudAgentPresentation {
    /// One Run's status as a person reads it, never the wire enum: a Run that
    /// stopped to ask a question is waiting on whoever answers it. Mirrors the
    /// App's `cloudAgentRunStatusLabels`.
    public static func runStatusLabel(_ status: CloudAgentStatus) -> String {
        switch status {
        case .queued: "Queued"
        case .running: "Running"
        case .completed: "Completed"
        case .failed: "Failed"
        case .cancelled: "Stopped"
        case .expired: "Expired"
        case .pendingInput: "Waiting on you"
        }
    }

    /// The newest Run: a work keeps its Runs newest first.
    public var newestRun: CloudAgentRun? { work.runs.first }

    /// What the attached-work header says the work is doing: the newest Run's
    /// status, else the work's own when no Run has reported yet.
    public var runStatusText: String {
        Self.runStatusLabel(newestRun?.status ?? work.status)
    }

    /// The newest Run's own summary, in full (ADR 0052 decision 12), as plain
    /// text. Nil until a Run has reported one.
    public var newestRunSummary: String? {
        guard let summary = newestRun?.summary else { return nil }
        let text = RichMessageParser.oneLinePreview(summary)
        return text.isEmpty ? nil : text
    }
}

/// A pull request attached to a Task, as its header lists it.
public struct TaskPullRequestPresentation: Identifiable, Hashable, Sendable {
    public let reading: CloudAgentPullRequestReading

    public init(reading: CloudAgentPullRequestReading) {
        self.reading = reading
    }

    public var id: String { reading.id }

    /// `PR #42`, then the title once GitHub has been read.
    public var title: String {
        guard let title = reading.title else { return "PR #\(reading.number)" }
        return "PR #\(reading.number) · \(title)"
    }

    public var url: URL? { CloudAgentPresentation.externalURL(reading.url) }

    public var stateLabel: String { Self.stateLabel(reading.state) }

    /// "Checks passing · Approved · 4 files": the App's `pullRequestFacts`.
    public var facts: String {
        let files = "\(reading.changedFiles) \(reading.changedFiles == 1 ? "file" : "files")"
        return "\(Self.checksLabel(reading.checks)) · \(Self.reviewLabel(reading.review)) · \(files)"
    }

    public static func stateLabel(_ state: String) -> String {
        switch state {
        case "open": "Open"
        case "merged": "Merged"
        case "closed": "Closed"
        case "draft": "Draft"
        default: "Unknown state"
        }
    }

    public static func checksLabel(_ checks: String) -> String {
        switch checks {
        case "failing": "Checks failing"
        case "none": "No checks"
        case "passing": "Checks passing"
        case "pending": "Checks running"
        default: "Checks unknown"
        }
    }

    public static func reviewLabel(_ review: String) -> String {
        switch review {
        case "approved": "Approved"
        case "changes-requested": "Changes requested"
        case "none": "No review"
        default: "Review unknown"
        }
    }
}

/// Everything attached to a Task, as its compact header lists it: each cloud
/// agent, then each pull request no cloud agent card already shows, so the
/// header says each pull request once (the App's `standalonePullRequests`).
public struct TaskAttachedWorkPresentation: Hashable, Sendable {
    public let cloudAgents: [CloudAgentPresentation]
    public let pullRequests: [TaskPullRequestPresentation]

    public init(cloudAgents: [CloudAgentPresentation], pullRequests: [CloudAgentPullRequestReading]) {
        self.cloudAgents = cloudAgents
        let shown = Set(cloudAgents.compactMap { $0.pullRequestURL?.absoluteString })
        self.pullRequests = pullRequests
            .filter { !shown.contains($0.url) }
            .map(TaskPullRequestPresentation.init)
    }

    public static let empty = TaskAttachedWorkPresentation(cloudAgents: [], pullRequests: [])

    public var isEmpty: Bool { cloudAgents.isEmpty && pullRequests.isEmpty }
}

/// What a Task screen's header states: which Task, where it stands, and the
/// work attached to it.
public struct TaskChatHeaderPresentation: Hashable, Sendable {
    public let key: String
    public let title: String
    public let state: TaskState
    public let attachedWork: TaskAttachedWorkPresentation

    public init(key: String, title: String, state: TaskState, attachedWork: TaskAttachedWorkPresentation) {
        self.key = key
        self.title = title
        self.state = state
        self.attachedWork = attachedWork
    }

    public var stateLabel: String { TaskStateLabel.text(state) }
}

/// The quiet row at the top of a Task's transcript that points at the Channel
/// Message it started from (ADR 0052 decision 3).
public struct TaskStartedFromPresentation: Hashable, Sendable {
    /// Where the origin is: `#security`.
    public let placeLabel: String
    /// The origin Message as one line, when its Channel page is loaded.
    public let excerpt: String?

    public init(placeLabel: String, excerpt: String?) {
        self.placeLabel = placeLabel
        self.excerpt = excerpt
    }

    public var title: String { "Started from \(placeLabel)" }
}
