import Foundation
import HausModels

/// One Worker as every surface reads it. Mirrors the App's
/// `cloud-agent-presentation.ts`.
public struct WorkerPresentation: Identifiable, Hashable, Sendable {
    public let work: Worker
    /// The delegating Agent, who sends any follow-up. The App resolves it from
    /// its Agent list; a retired Agent reads as `Agent <id suffix>`, like the App.
    public let agentName: String
    public var id: String { work.id }

    public init(work: Worker, agentName: String? = nil) {
        self.work = work
        self.agentName = agentName ?? "Captain \(work.agentId.suffix(6))"
    }

    public var providerName: String { Self.providerName(work.provider) }

    public static func providerName(_ provider: String) -> String {
        switch provider {
        case "cursor": "Cursor"
        case "claude": "Claude"
        default: provider
        }
    }

    /// The branch evidence the job has produced: the newest Run that reported
    /// a pull request, then the newest that reported any branch, so a
    /// follow-up never hides the earlier pull request.
    public var branch: WorkerBranch? {
        let branches = work.runs.flatMap(\.branches)
        return branches.first { $0.pullRequestUrl != nil } ?? branches.first
    }

    public var pullRequestURL: URL? { Self.externalURL(branch?.pullRequestUrl) }

    /// The live reading, else the snapshot its Run reported.
    public var pullRequest: WorkerPullRequest? { work.pullRequest ?? branch?.pullRequest }

    /// `PR #<n>` from the Computer's GitHub snapshot, else parsed from the
    /// provider's URL; an unrecognised URL keeps its link and loses the number.
    public var pullRequestNumber: Int? {
        guard let branch else { return nil }
        if let pr = branch.pullRequest { return pr.number }
        return branch.pullRequestUrl.flatMap(RichReferenceWireForm.pullRequestNumber(in:))
    }

    /// The Cloud Agent duration grammar, matching the App's
    /// `formatWorkerDuration`: `45s`, `25m`, `2h`, `2h 5m`, `26h 5m`.
    /// Hours do not roll into days, so a long run reads the same on both.
    public static func duration(seconds: Int) -> String {
        let seconds = max(0, seconds)
        if seconds < 60 { return "\(seconds)s" }
        let minutes = seconds / 60
        if minutes < 60 { return "\(minutes)m" }
        let hours = minutes / 60
        let remainder = minutes % 60
        return remainder == 0 ? "\(hours)h" : "\(hours)h \(remainder)m"
    }

    static func duration(from start: Date, to end: Date) -> String {
        duration(seconds: Int(end.timeIntervalSince(start).rounded(.down)))
    }

    public static func externalURL(_ value: String?) -> URL? {
        guard let value, let url = URL(string: value),
              ["https", "http"].contains(url.scheme?.lowercased()), url.host != nil else { return nil }
        return url
    }
}
