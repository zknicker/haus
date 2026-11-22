import Foundation
import HausModels

extension WorkerPresentation {
    public static func runStatusLabel(_ status: WorkerTurnStatus) -> String {
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

    public var newestRun: WorkerTurn? { work.runs.first }

    public var runStatusText: String {
        Self.runStatusLabel(newestRun?.status ?? work.status)
    }

    public var newestRunSummary: String? {
        guard let summary = newestRun?.summary else { return nil }
        let text = RichMessageParser.oneLinePreview(summary)
        return text.isEmpty ? nil : text
    }
}

public struct TaskPullRequestPresentation: Identifiable, Hashable, Sendable {
    public let reading: PullRequestReading

    public init(reading: PullRequestReading) {
        self.reading = reading
    }

    public var id: String { reading.id }

    public var title: String {
        guard let title = reading.title else { return "PR #\(reading.number)" }
        return "PR #\(reading.number) · \(title)"
    }

    public var url: URL? { WorkerPresentation.externalURL(reading.url) }

    public var stateLabel: String { Self.stateLabel(reading.state) }

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

public struct TaskAttachedWorkPresentation: Hashable, Sendable {
    public let cloudAgents: [WorkerPresentation]
    public let pullRequests: [TaskPullRequestPresentation]

    public init(cloudAgents: [WorkerPresentation], pullRequests: [PullRequestReading]) {
        self.cloudAgents = cloudAgents
        let shown = Set(cloudAgents.compactMap { $0.pullRequestURL?.absoluteString })
        self.pullRequests = pullRequests
            .filter { !shown.contains($0.url) }
            .map(TaskPullRequestPresentation.init)
    }

    public static let empty = TaskAttachedWorkPresentation(cloudAgents: [], pullRequests: [])

    public var isEmpty: Bool { cloudAgents.isEmpty && pullRequests.isEmpty }
}

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

public struct TaskStartedFromPresentation: Hashable, Sendable {
    public let placeLabel: String
    public let excerpt: String?

    public init(placeLabel: String, excerpt: String?) {
        self.placeLabel = placeLabel
        self.excerpt = excerpt
    }

    public var title: String { "Started from \(placeLabel)" }
}
