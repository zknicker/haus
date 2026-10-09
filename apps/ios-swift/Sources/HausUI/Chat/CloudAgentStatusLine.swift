import Foundation
import HausModels

/// The card's one status line. It is always present and always one line, so a
/// follow-up or a quiet spell never adds or removes a row: the card only grows
/// when its pull request first appears. Mirrors the App's
/// `cloud-agent-status-line.ts`.
public struct CloudAgentStatusLine: Hashable, Sendable {
    public enum Tone: Hashable, Sendable { case muted, warning, danger }

    public let text: String
    public let tone: Tone
}

extension CloudAgentPresentation {
    /// The most urgent fact wins: why the job failed, that a live Run has gone
    /// quiet, that a stop was requested, that the delegating Agent sent a
    /// follow-up, otherwise the latest activity or when the job settled.
    public func statusLine(agentName: String, at now: Date) -> CloudAgentStatusLine {
        let job = work.job
        if case .failed(let errorCode, let summary, _, _) = job {
            return CloudAgentStatusLine(text: Self.failureReason(errorCode: errorCode, summary: summary), tone: .danger)
        }
        if let quiet = quietFor(at: now) {
            return CloudAgentStatusLine(text: "No update in \(Self.duration(seconds: Int(quiet)))", tone: .warning)
        }
        if let requestedAt = work.cancelRequestedAt, work.status.isActive {
            return CloudAgentStatusLine(text: "Stopping · requested \(relative(requestedAt, now))", tone: .muted)
        }
        if let followUp = job.followUp {
            let verb = followUp.state == .waiting ? "waiting" : "running"
            let elapsed = Self.duration(from: followUp.since, to: now)
            return CloudAgentStatusLine(text: "\(agentName) asked for changes · \(verb) \(elapsed)", tone: .muted)
        }
        let settledAt = job.settledAt ?? work.updatedAt
        let text: String = switch job.state {
        case .working:
            work.activity.flatMap { Self.oneLine($0.summary) } ?? "Updated \(relative(work.updatedAt, now))"
        case .done:
            "Finished \(relative(settledAt, now))"
        case .cancelled, .expired, .failed:
            "\(Self.jobLabel(job.state)) · \(relative(settledAt, now))"
        }
        return CloudAgentStatusLine(text: text, tone: .muted)
    }

    /// The provider's own report, else its error code, as one readable line.
    static func failureReason(errorCode: String?, summary: String?) -> String {
        if let line = summary.flatMap(oneLine) { return line }
        if let errorCode {
            let words = errorCode.replacingOccurrences(of: #"[_-]+"#, with: " ", options: .regularExpression)
                .trimmingCharacters(in: .whitespaces)
            if let first = words.first { return first.uppercased() + words.dropFirst() }
        }
        return "The run failed without a reason"
    }

    /// Markdown a provider wrote, as the one flat line a surface can show.
    static func oneLine(_ text: String) -> String? {
        let line = RichMessageParser.oneLinePreview(text)
        return line.isEmpty ? nil : line
    }

    private func relative(_ date: Date, _ now: Date) -> String {
        AutomationFormatting.relativeTime(date, now: now)
    }
}
