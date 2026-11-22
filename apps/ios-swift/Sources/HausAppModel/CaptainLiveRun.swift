import Foundation
import HausModels

/// One Captain's running turn as turn details draws it: the run, when it started
/// (`agent.activeActivity`'s `runStartedAt`), and every activity event it has reported, kept in
/// run-position order. Events arrive from `agent.onActivity` and, on a mid-run open, from
/// `agent.activityHistory` for the run; both merge by position, so neither duplicates the other.
public struct CaptainLiveRun: Equatable, Sendable {
    public let agentID: String
    public let runID: String
    public private(set) var startedAt: Date?
    public private(set) var events: [AgentActivityEvent]

    public init(agentID: String, runID: String, startedAt: Date? = nil, events: [AgentActivityEvent] = []) {
        self.agentID = agentID
        self.runID = runID
        self.startedAt = startedAt
        self.events = Self.ordered(events.filter { $0.runID == runID && $0.agentID == agentID })
    }

    /// The run with `incoming` folded in. Another run's events are ignored; a position already
    /// held keeps its event.
    public func merging(_ incoming: [AgentActivityEvent]) -> CaptainLiveRun {
        let owned = incoming.filter { $0.runID == runID && $0.agentID == agentID }
        guard !owned.isEmpty else { return self }
        var next = self
        next.events = Self.ordered(events + owned)
        return next
    }

    /// One event per position, the first seen kept, in position order.
    private static func ordered(_ events: [AgentActivityEvent]) -> [AgentActivityEvent] {
        let byPosition = Dictionary(events.map { ($0.position, $0) }, uniquingKeysWith: { first, _ in first })
        return byPosition.values.sorted { $0.position < $1.position }
    }

    /// The run with its start time, once the Server has stated it.
    public func started(at date: Date?) -> CaptainLiveRun {
        guard let date, startedAt != date else { return self }
        var next = self
        next.startedAt = date
        return next
    }
}
