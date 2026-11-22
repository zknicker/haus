import Foundation
import HausModels

/// Where an open pull request stands in the list. Merged and closed readings
/// are settled and sit in no group.
public enum PullRequestGroup: CaseIterable, Hashable, Sendable {
    case ready
    case waitingOnChecks
    case draft

    public init?(state: String, checks: String) {
        switch state {
        case "draft": self = .draft
        case "open": self = Self.blockingChecks.contains(checks) ? .waitingOnChecks : .ready
        default: return nil
        }
    }

    public var title: String {
        switch self {
        case .ready: "Ready"
        case .waitingOnChecks: "Waiting on checks"
        case .draft: "Draft"
        }
    }

    static let blockingChecks: Set<String> = ["pending", "failing"]
}

/// Lines added and removed, drawn green and red: `+38 −612`.
public struct PullRequestDiffstat: Hashable, Sendable {
    public let additions: Int
    public let deletions: Int

    /// Nil when the reading saw no changed lines, so nothing claims `+0 −0`.
    public init?(additions: Int, deletions: Int) {
        guard additions > 0 || deletions > 0 else { return nil }
        self.additions = additions
        self.deletions = deletions
    }

    public var additionsText: String { "+\(additions)" }
    public var deletionsText: String { "\u{2212}\(deletions)" }
    public var text: String { "\(additionsText) \(deletionsText)" }

    public static func filesText(_ count: Int) -> String {
        "\(count) \(count == 1 ? "file" : "files")"
    }
}

/// One piece of a pull request row's meta line.
public enum PullRequestMetaPiece: Hashable, Sendable {
    case reference(String)
    case status(String)
    case diffstat(PullRequestDiffstat)
    case age(String)
}

/// A pull request reading as the Work view and the detail read it, with what
/// the place knows about where it came from.
public struct PullRequestPresentation: Identifiable, Hashable, Sendable {
    public let reading: PullRequestReading
    public let context: PullRequestContext

    public init(reading: PullRequestReading, context: PullRequestContext = PullRequestContext()) {
        self.reading = reading
        self.context = context
    }

    public var id: String { reading.id }

    public var title: String { reading.title ?? "Pull request #\(reading.number)" }

    public var group: PullRequestGroup? { PullRequestGroup(state: reading.state, checks: reading.checks) }

    /// The repository's own name, without its owner: `haus/haus` reads `haus`.
    public var repositoryName: String {
        reading.repository.split(separator: "/").last.map(String.init) ?? reading.repository
    }

    public var reference: String { "\(repositoryName)#\(reading.number)" }

    public var diffstat: PullRequestDiffstat? {
        PullRequestDiffstat(additions: reading.additions, deletions: reading.deletions)
    }

    public var filesText: String { PullRequestDiffstat.filesText(reading.changedFiles) }

    public var url: URL? { WorkerPresentation.externalURL(reading.url) }

    public var stateLabel: String { TaskPullRequestPresentation.stateLabel(reading.state) }

    /// The review rollup, or nil when nobody knows it.
    public var reviewLabel: String? {
        reading.review == "unknown" ? nil : TaskPullRequestPresentation.reviewLabel(reading.review)
    }

    public var checksLabel: String {
        switch reading.checks {
        case "passing": "Passing"
        case "pending": "Running"
        case "failing": "Failing"
        case "none": "None"
        default: "Unknown"
        }
    }

    /// `head → base` from the Worker's branch evidence, or the head alone.
    public var branchText: String? {
        guard let head = context.headBranch else { return nil }
        guard let base = context.baseBranch else { return head }
        return "\(head) \u{2192} \(base)"
    }

    /// When the reading was taken, which is the newest thing Haus knows.
    public var readAt: Date? { reading.observedAt }

    /// The meta line: the reference, then what holds the pull request back,
    /// or, when nothing does, its diffstat and age.
    public func metaPieces(now: Date) -> [PullRequestMetaPiece] {
        var pieces: [PullRequestMetaPiece] = [.reference(reference)]
        let statuses = statusTexts
        if statuses.isEmpty {
            if let diffstat { pieces.append(.diffstat(diffstat)) }
            if let readAt { pieces.append(.age(HausCompactRelativeTime.label(for: readAt, now: now))) }
        } else {
            pieces += statuses.map(PullRequestMetaPiece.status)
        }
        return pieces
    }

    public var sourceNote: String {
        switch reading.source {
        case .github: "Read from GitHub. Review, comment and merge happen there."
        case .computer: "Read by the Worker’s Device. Review, comment and merge happen on GitHub."
        }
    }

    private var statusTexts: [String] {
        var texts: [String] = []
        switch reading.state {
        case "draft": texts.append("draft")
        case "merged": texts.append("merged")
        case "closed": texts.append("closed")
        default: break
        }
        switch reading.checks {
        case "pending": texts.append("checks pending")
        case "failing": texts.append("checks failing")
        default: break
        }
        return texts
    }
}

extension PullRequestPresentation {
    /// The tone of the pull request glyph: failing checks are critical,
    /// running ones cautious, a mergeable one positive, and a draft quiet.
    var tone: HausTone {
        switch reading.state {
        case "merged": return .accentInk
        case "closed": return .critical
        default: break
        }
        switch reading.checks {
        case "failing": return .critical
        case "pending": return .caution
        default: return reading.state == "draft" ? .mutedInk : .positive
        }
    }

    var checksTone: HausTone {
        switch reading.checks {
        case "passing": .positive
        case "pending": .caution
        case "failing": .critical
        default: .mutedInk
        }
    }

    var checksSymbol: String {
        switch reading.checks {
        case "passing": "checkmark"
        case "pending": "clock"
        case "failing": "xmark"
        default: "minus"
        }
    }

    /// Ready first, then waiting, then drafts; settled readings drop out.
    public static func listed(_ pullRequests: [PullRequestPresentation]) -> [PullRequestPresentation] {
        PullRequestGroup.allCases.flatMap { group in pullRequests.filter { $0.group == group } }
    }
}
