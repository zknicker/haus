import Foundation
import HausModels

public struct CloudAgentPresentation: Identifiable, Hashable, Sendable {
    public let work: CloudAgentWork
    /// The App link to the conversation holding the work, for Copy link. Nil
    /// when the Server or conversation is not known, which hides the action.
    public let conversationLink: URL?
    public var id: String { work.id }

    public init(work: CloudAgentWork, conversationLink: URL? = nil) {
        self.work = work
        self.conversationLink = conversationLink
    }

    public var providerName: String { work.provider == "cursor" ? "Cursor" : work.provider }
    public var statusLabel: String {
        if work.status.isActive, work.cancelRequestedAt != nil { return "Cancelling" }
        switch work.status {
        case .queued: return "Queued"
        case .running: return "Running"
        case .completed: return "Done"
        case .failed: return "Failed"
        case .cancelled: return "Cancelled"
        case .expired: return "Expired"
        }
    }

    public var durationLabel: String? {
        guard work.status == .completed, let start = work.startedAt, let end = work.terminalAt else { return nil }
        return Self.duration(seconds: Int(end.timeIntervalSince(start)))
    }

    public var branches: [CloudAgentBranch] {
        work.runs.first?.branches ?? []
    }

    /// The one branch the card states: the one that opened a pull request,
    /// else the first the run wrote.
    public var primaryBranch: CloudAgentBranch? {
        branches.first { $0.pullRequestUrl != nil } ?? branches.first
    }

    public var pullRequestURL: URL? { Self.externalURL(primaryBranch?.pullRequestUrl) }

    /// `PR #<n>` from the Computer's GitHub snapshot, else parsed from the
    /// provider's URL; an unrecognised URL keeps its link and loses the number.
    public var pullRequestNumber: Int? {
        guard let branch = primaryBranch else { return nil }
        if let pr = branch.pullRequest { return pr.number }
        guard let url = branch.pullRequestUrl, let range = url.range(of: #"/pull/(\d+)"#, options: .regularExpression)
        else { return nil }
        return Int(url[range].dropFirst("/pull/".count))
    }

    /// The branch fact without repeating the card's repository, unless the
    /// branch lives somewhere else. Before any branch, the starting ref.
    public var branchLabel: String {
        guard let branch = primaryBranch else {
            return work.startingRef.map { "Base: \($0)" } ?? "No branch yet"
        }
        return branch.repository == work.repository ? branch.branch : "\(branch.repository) · \(branch.branch)"
    }

    /// What a live work is doing now; a settled work says nothing here.
    public var activityLine: String? {
        guard work.status.isActive, let summary = work.activity?.summary else { return nil }
        let line = RichMessageParser.oneLinePreview(summary)
        return line.isEmpty ? nil : line
    }

    public var canBeCancelled: Bool { work.status.isActive && work.cancelRequestedAt == nil }

    public var compactDescription: String? {
        guard work.status == .completed else { return work.title }
        guard let diff = primaryBranch?.pullRequest else { return nil }
        return "\(diff.changedFiles) \(diff.changedFiles == 1 ? "file" : "files") changed · +\(diff.additions) −\(diff.deletions)"
    }

    public func statusText(at now: Date) -> String {
        if work.status == .running, work.cancelRequestedAt == nil, let start = work.startedAt {
            return "Running · \(Self.duration(seconds: Int(now.timeIntervalSince(start))))"
        }
        return [statusLabel, durationLabel].compactMap { $0 }.joined(separator: " · ")
    }

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

    public func isStale(at now: Date) -> Bool {
        work.status == .running && now.timeIntervalSince(work.updatedAt) > 600
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
