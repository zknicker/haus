import Foundation
import HausModels

/// One Cloud Agent work as every surface reads it. Mirrors the App's
/// `cloud-agent-presentation.ts`; the card's headline is the Server-derived
/// `job`, never the newest Run's status.
public struct CloudAgentPresentation: Identifiable, Hashable, Sendable {
    public let work: CloudAgentWork
    /// The App link to the conversation holding the work, for Copy link. Nil
    /// when the Server or conversation is not known, which hides the action.
    public let conversationLink: URL?
    /// The delegating Agent, who sends any follow-up. The App resolves it from
    /// its Agent list; a retired Agent reads as `Agent <id suffix>`, like the App.
    public let agentName: String
    public var id: String { work.id }

    /// A live work that has not reported for this long reads as gone quiet.
    public static let staleAfter: TimeInterval = 10 * 60

    public init(work: CloudAgentWork, conversationLink: URL? = nil, agentName: String? = nil) {
        self.work = work
        self.conversationLink = conversationLink
        self.agentName = agentName ?? "Agent \(work.agentId.suffix(6))"
    }

    public var providerName: String { Self.providerName(work.provider) }

    public static func providerName(_ provider: String) -> String {
        provider == "cursor" ? "Cursor" : provider
    }

    /// The headline: the job's state, never its newest Run's. A working job
    /// states how long it has been going; a done one how long it took.
    public func jobText(at now: Date) -> String {
        let label = Self.jobLabel(work.job.state)
        switch work.job {
        case .working(let startedAt, _):
            guard let startedAt else { return label }
            return "\(label) · \(Self.duration(from: startedAt, to: now))"
        case .done(let startedAt, let settledAt, _):
            guard let startedAt, let settledAt else { return label }
            return "\(label) · \(Self.duration(from: startedAt, to: settledAt))"
        case .failed, .cancelled, .expired:
            return label
        }
    }

    public static func jobLabel(_ state: CloudAgentJobState) -> String {
        switch state {
        case .working: "Working"
        case .done: "Done"
        case .failed: "Failed"
        case .cancelled: "Cancelled"
        case .expired: "Expired"
        }
    }

    /// How long a live work has been quiet, once that passes the stale
    /// threshold. Reads the work's own `updatedAt`, which any Run's observation
    /// advances, never Computer connection state.
    public func quietFor(at now: Date) -> TimeInterval? {
        guard work.status.isActive else { return nil }
        let quiet = now.timeIntervalSince(work.updatedAt)
        return quiet > Self.staleAfter ? quiet : nil
    }

    /// The branch evidence the job has produced: the newest Run that reported
    /// a pull request, then the newest that reported any branch, so a
    /// follow-up never hides the earlier pull request.
    public var branch: CloudAgentBranch? {
        let branches = work.runs.flatMap(\.branches)
        return branches.first { $0.pullRequestUrl != nil } ?? branches.first
    }

    public var pullRequestURL: URL? { Self.externalURL(branch?.pullRequestUrl) }

    /// `PR #<n>` from the Computer's GitHub snapshot, else parsed from the
    /// provider's URL; an unrecognised URL keeps its link and loses the number.
    public var pullRequestNumber: Int? {
        guard let branch else { return nil }
        if let pr = branch.pullRequest { return pr.number }
        return branch.pullRequestUrl.flatMap(RichReferenceWireForm.pullRequestNumber(in:))
    }

    /// Cancel is for a live Run nobody has asked to stop; the role gate is the
    /// App's cancel action, installed only for Owners and Admins.
    public var canBeCancelled: Bool { work.status.isActive && work.cancelRequestedAt == nil }

    /// The Cloud Agent duration grammar, matching the App's
    /// `formatCloudAgentDuration`: `45s`, `25m`, `2h`, `2h 5m`, `26h 5m`.
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

    /// The work a Message's Thread preview lists: everything delegated inside
    /// its Thread, never the Message's own work, whose card sits above the
    /// preview. The conversation read keys parent-Chat work by its own Message.
    public static func threadPreviewWork(
        _ rows: [ThreadCloudAgentWork], anchorMessageID: String, ownWorkID: String?
    ) -> [CloudAgentWork] {
        rows.filter { $0.anchorMessageId == anchorMessageID && $0.work.id != ownWorkID }.map(\.work)
    }

    public static func externalURL(_ value: String?) -> URL? {
        guard let value, let url = URL(string: value),
              ["https", "http"].contains(url.scheme?.lowercased()), url.host != nil else { return nil }
        return url
    }
}
