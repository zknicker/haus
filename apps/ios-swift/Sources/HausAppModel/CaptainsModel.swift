import Foundation
import HausModels
import HausTransport
import Observation
import OSLog

/// What a Captains write changed, for the composition root's memoized
/// projections and launch snapshot.
public enum CaptainsChange: Equatable, Sendable {
    case agents([AgentSummary])
    case presence
}

/// The Server's Captains (Agents on the wire) and their live work: the Agent
/// list, the lifecycle presence overlay `agent.onLifecycle` keeps, and the
/// semantic activity `agent.onActivity` keeps.
@MainActor
@Observable
public final class CaptainsModel {
    private var storedAgents: [AgentSummary] = []
    private var storedLifecycleAvailability: [String: AgentAvailability] = [:]
    public internal(set) var currentActivityByAgentID: [String: AgentActivityEvent] = [:] {
        didSet {
            let working = !currentActivityByAgentID.isEmpty
            if isAnyAgentWorking != working { isAnyAgentWorking = working }
        }
    }
    /// Whether any Captain on the active Server is working right now. Until
    /// the Server has answered (`hasActivitySnapshot`) the answer is "no"
    /// rather than a guess.
    public private(set) var isAnyAgentWorking = false
    public internal(set) var hasActivitySnapshot = false
    public internal(set) var activityPositionByRunID: [String: Int] = [:]
    /// Each working Captain's running turn, step by step, for turn details. Settlement removes it.
    public internal(set) var liveRunsByAgentID: [String: CaptainLiveRun] = [:]
    /// Captains whose stop the Server took while their turn still runs. The
    /// turn's settlement clears it (`CaptainsModel+Stop.swift`).
    public internal(set) var pendingStops: Set<String> = []
    /// Advances on every lifecycle event, so a list read can tell whether
    /// the overlay moved while it was in flight.
    public private(set) var lifecycleRevision = 0

    /// Called after each write that changes the Agent list or presence.
    @ObservationIgnored public var onChange: @MainActor (CaptainsChange) -> Void = { _ in }
    @ObservationIgnored let client: TRPCClient
    @ObservationIgnored let scope: ServerScope

    public init(client: TRPCClient, scope: ServerScope) {
        self.client = client
        self.scope = scope
    }

    /// Names, avatars, and presence for every Captain. Equal writes are
    /// dropped: Observation reports them as changes.
    public var agents: [AgentSummary] {
        get { storedAgents }
        set {
            guard storedAgents != newValue else { return }
            storedAgents = newValue
            onChange(.agents(newValue))
        }
    }

    /// The live presence overlay over `agent.list`.
    public var lifecycleAvailability: [String: AgentAvailability] {
        get { storedLifecycleAvailability }
        set {
            guard storedLifecycleAvailability != newValue else { return }
            storedLifecycleAvailability = newValue
            onChange(.presence)
        }
    }

    public func availability(for agent: AgentSummary) -> AgentAvailability {
        lifecycleAvailability[agent.id] ?? agent.availability
    }

    public func clearLifecycleAvailability(ifRevisionIs revision: Int) {
        guard lifecycleRevision == revision, !lifecycleAvailability.isEmpty else { return }
        lifecycleAvailability.removeAll()
    }

    /// A Server switch or membership loss: nothing live of the old Server
    /// may stand beside the new one's reads.
    public func reset() {
        agents = []
        lifecycleAvailability = [:]
        currentActivityByAgentID = [:]
        activityPositionByRunID = [:]
        liveRunsByAgentID = [:]
        pendingStops = []
        hasActivitySnapshot = false
    }

    // MARK: - Lifecycle overlay

    /// Applies one `agent.onLifecycle` event. Returns what it did, so the
    /// caller can refresh what a settled turn moves.
    @discardableResult
    public func apply(_ event: AgentLifecycleEvent) -> LifecycleApplication {
        guard scope.isActive(event.serverID) else { return .ignored }
        lifecycleRevision += 1
        switch event.phase {
        case .working, .reading, .sending:
            if let current = currentActivityByAgentID[event.agentID], current.runID != event.runID {
                currentActivityByAgentID.removeValue(forKey: event.agentID)
            }
            if let live = liveRunsByAgentID[event.agentID], live.runID != event.runID {
                liveRunsByAgentID.removeValue(forKey: event.agentID)
            }
            setLifecycleAvailability(.working, for: event.agentID)
            return .working
        case .settled:
            let settled: AgentAvailability = switch event.outcome {
            case .completed: .idle
            case .failed: .error
            case .stopped: .stopped
            case nil: .idle
            }
            setLifecycleAvailability(settled, for: event.agentID)
            if currentActivityByAgentID[event.agentID] != nil {
                currentActivityByAgentID.removeValue(forKey: event.agentID)
            }
            if activityPositionByRunID[event.runID] != nil {
                activityPositionByRunID.removeValue(forKey: event.runID)
            }
            if liveRunsByAgentID[event.agentID] != nil {
                liveRunsByAgentID.removeValue(forKey: event.agentID)
            }
            if pendingStops.contains(event.agentID) {
                pendingStops.remove(event.agentID)
            }
            return .settled
        }
    }

    private func setLifecycleAvailability(_ availability: AgentAvailability, for agentID: String) {
        guard lifecycleAvailability[agentID] != availability else { return }
        lifecycleAvailability[agentID] = availability
    }

    static let logger = Logger(subsystem: "chat.haus.ios", category: "captains")
}

public enum LifecycleApplication: Equatable, Sendable {
    /// The event named a Server this client is not showing.
    case ignored
    case working
    case settled
}
