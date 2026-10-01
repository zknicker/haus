import Foundation
import HausModels

public struct CloudAgentPresentation: Identifiable, Hashable, Sendable {
    public let work: CloudAgentWork
    public let delegatedBy: String
    public var id: String { work.id }

    public init(work: CloudAgentWork, delegatedBy: String) {
        self.work = work
        self.delegatedBy = delegatedBy
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

    public var compactDescription: String? {
        guard work.status == .completed else { return work.title }
        let branch = branches.first { $0.pullRequestUrl != nil } ?? branches.first
        guard let diff = branch?.pullRequest else { return nil }
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

    public static func externalURL(_ value: String?) -> URL? {
        guard let value, let url = URL(string: value),
              ["https", "http"].contains(url.scheme?.lowercased()), url.host != nil else { return nil }
        return url
    }
}
