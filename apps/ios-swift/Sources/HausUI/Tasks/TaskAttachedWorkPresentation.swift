import Foundation
import HausModels

extension WorkerPresentation {
    public var newestRun: WorkerTurn? { work.runs.first }

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

/// A Task chat's header: the Task's key, title, and state. Its Workers and
/// pull requests live in the Work view.
public struct TaskChatHeaderPresentation: Hashable, Sendable {
    public let key: String
    public let title: String
    public let state: TaskState

    public init(key: String, title: String, state: TaskState) {
        self.key = key
        self.title = title
        self.state = state
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
