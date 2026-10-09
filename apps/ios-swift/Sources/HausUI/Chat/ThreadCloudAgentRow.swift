import Foundation
import HausModels

/// One job as the Thread preview lists it: its job state in the card's
/// vocabulary and the pull request number once there is one. A live job that
/// has gone quiet reads as `No update in <d>` instead of its state, because
/// that is the fact a reader has to act on. Ordering mirrors the App's
/// `thread-cloud-agent-row-model.ts`.
public struct ThreadCloudAgentRow: Identifiable, Hashable, Sendable {
    public enum Tone: Hashable, Sendable { case standard, warning }

    public let agent: CloudAgentPresentation
    public let state: CloudAgentJobState
    public let statusText: String
    public let tone: Tone
    public let pullRequestNumber: Int?

    public var id: String { agent.id }
    public var work: CloudAgentWork { agent.work }

    /// A working job with nothing to act on yet shows only its header once a
    /// Thread stack is expanded; a failure, a pull request, a quiet spell, or
    /// an ending keeps the full card, whose status line and actions carry it.
    public var usesCompactCard: Bool {
        state == .working && tone == .standard && pullRequestNumber == nil
    }

    /// One row per job in the order the jobs were started (oldest first), so
    /// rows never move while their jobs change state. Ties keep the Server's order.
    public static func rows(_ agents: [CloudAgentPresentation], at now: Date) -> [ThreadCloudAgentRow] {
        agents.enumerated()
            .sorted { ($0.element.work.createdAt, $0.offset) < ($1.element.work.createdAt, $1.offset) }
            .map { row($0.element, at: now) }
    }

    static func row(_ agent: CloudAgentPresentation, at now: Date) -> ThreadCloudAgentRow {
        let job = agent.work.job
        let quiet = job.state == .failed ? nil : agent.quietFor(at: now)
        let statusText: String
        if let quiet {
            statusText = "No update in \(CloudAgentPresentation.duration(seconds: Int(quiet)))"
        } else if case .working(let startedAt?, _) = job {
            statusText = "\(CloudAgentPresentation.jobLabel(.working)) · \(CloudAgentPresentation.duration(from: startedAt, to: now))"
        } else {
            statusText = CloudAgentPresentation.jobLabel(job.state)
        }
        return ThreadCloudAgentRow(
            agent: agent,
            state: job.state,
            statusText: statusText,
            tone: quiet == nil ? .standard : .warning,
            pullRequestNumber: agent.pullRequestNumber
        )
    }
}

/// The Cloud Agent jobs a Thread preview states. One job is just its card. Two
/// or more collapse into a notification-style stack: a header naming how many
/// and how they stand, the job that most needs attention on top, and up to two
/// edges peeking beneath it. Expanding lists every job in the order they started.
public struct ThreadCloudAgentStack: Hashable, Sendable {
    public struct Count: Hashable, Sendable {
        public enum Tone: Hashable, Sendable { case danger, warning, standard }
        public let text: String
        public let tone: Tone
    }

    /// The deepest a collapsed stack draws: more edges read as noise, not depth.
    public static let maxPeeks = 2

    public let rows: [ThreadCloudAgentRow]

    public init(_ agents: [CloudAgentPresentation], at now: Date) {
        rows = ThreadCloudAgentRow.rows(agents, at: now)
    }

    /// One job needs no header, count, or stack: its card says everything.
    public var isSingle: Bool { rows.count == 1 }

    /// The job that leads the collapsed stack: the first failed job, else the
    /// first gone quiet, else the first started. It changes only when a job's
    /// state does, going quiet included.
    public var top: ThreadCloudAgentRow? {
        rows.first { $0.state == .failed } ?? rows.first { $0.tone == .warning } ?? rows.first
    }

    /// The jobs whose edges peek under the collapsed top card, in the order
    /// they started.
    public var peeks: [ThreadCloudAgentRow] {
        Array(rows.filter { $0.id != top?.id }.prefix(Self.maxPeeks))
    }

    /// How many card edges peek under the collapsed top card.
    public var peekCount: Int { peeks.count }

    public var title: String { "\(rows.count) cloud agents" }

    /// How the jobs stand, problems first and tinted: `1 failed · 2 no update ·
    /// 7 working · 1 done`. A quiet job counts as no update, not as working.
    public var counts: [Count] {
        let buckets: [(String, Count.Tone, (ThreadCloudAgentRow) -> Bool)] = [
            ("failed", .danger, { $0.state == .failed }),
            ("no update", .warning, { $0.tone == .warning }),
            ("working", .standard, { $0.state == .working && $0.tone == .standard }),
            ("done", .standard, { $0.state == .done && $0.tone == .standard }),
            ("cancelled", .standard, { $0.state == .cancelled && $0.tone == .standard }),
            ("expired", .standard, { $0.state == .expired && $0.tone == .standard }),
        ]
        return buckets.compactMap { label, tone, matches in
            let count = rows.filter(matches).count
            return count == 0 ? nil : Count(text: "\(count) \(label)", tone: tone)
        }
    }

    public var countsText: String { counts.map(\.text).joined(separator: " · ") }
}
