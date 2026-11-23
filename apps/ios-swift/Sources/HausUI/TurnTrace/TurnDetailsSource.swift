import Foundation
import HausModels
import Observation

/// One Captain's running turn, as the App's Captains model keeps it.
public struct TurnLiveRun: Equatable, Sendable {
    public let agentID: String
    public let runID: String
    public let startedAt: Date?
    public let events: [AgentActivityEvent]

    public init(agentID: String, runID: String, startedAt: Date?, events: [AgentActivityEvent]) {
        self.agentID = agentID
        self.runID = runID
        self.startedAt = startedAt
        self.events = events
    }
}

/// What an open turn details sheet asks the App for: its Captains and the run each is on now.
/// A new run changes the request, so the sheet reconnects for it.
public struct TurnDetailsRequest: Hashable, Sendable {
    public let agentIDs: [String]
    public let liveRunIDs: [String: String]

    public init(agentIDs: [String], liveRunIDs: [String: String]) {
        self.agentIDs = agentIDs
        self.liveRunIDs = liveRunIDs
    }
}

/// The reads turn details shows beside the live runs, filled by the App while the sheet is open:
/// settled turns for everyone, and outlines and journals when the viewer may read execution
/// evidence (Owners and Admins).
@MainActor
@Observable
public final class TurnDetailsContent {
    public private(set) var turnsByAgentID: [String: [AgentTurn]] = [:]
    public private(set) var outlinesByRunID: [String: AgentExecutionOutlineEntry] = [:]
    public private(set) var journalsByRunID: [String: AgentExecutionJournal] = [:]
    /// Whether execution evidence shows. A refusal turns it off for the sheet's life.
    public var showsExecutionEvidence = false

    public init() {}

    public func setTurns(_ turns: [AgentTurn], for agentID: String) {
        if turnsByAgentID[agentID] != turns { turnsByAgentID[agentID] = turns }
    }

    public func setOutlines(_ entries: [AgentExecutionOutlineEntry]) {
        for entry in entries where outlinesByRunID[entry.runID] != entry {
            outlinesByRunID[entry.runID] = entry
        }
    }

    public func setJournal(_ result: AgentExecutionJournalResult) {
        guard case .available(_, let journal) = result, journalsByRunID[journal.runID] != journal else { return }
        journalsByRunID[journal.runID] = journal
    }

    /// Whether a Captain's settled turns have loaded; until then the Earlier card stays blank.
    public func hasLoadedTurns(for agentID: String) -> Bool {
        turnsByAgentID[agentID] != nil
    }
}

/// The App's side of turn details, carried on `ChatEngagementSource`. `liveRun` reads the Captains
/// model's observed state, so the sheet redraws as steps land; `connect` runs while the sheet is
/// open and ends its journal subscriptions when it closes.
public struct TurnDetailsSource: Sendable {
    public let liveRun: @MainActor @Sendable (_ agentID: String) -> TurnLiveRun?
    public let connect: @MainActor @Sendable (_ request: TurnDetailsRequest, _ content: TurnDetailsContent) async -> Void

    public init(
        liveRun: @escaping @MainActor @Sendable (String) -> TurnLiveRun?,
        connect: @escaping @MainActor @Sendable (TurnDetailsRequest, TurnDetailsContent) async -> Void
    ) {
        self.liveRun = liveRun
        self.connect = connect
    }
}
