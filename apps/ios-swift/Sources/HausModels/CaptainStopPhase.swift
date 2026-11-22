import Foundation

/// Where Stop stands for one Captain (`agent.stop`), read from the Server's
/// answers. Stop ends a running turn, so it is offered only while one runs,
/// and only to an Owner or Admin, the roles the Server lets stop a Captain.
public enum CaptainStopPhase: Hashable, Sendable {
    /// A running turn the viewer may stop.
    case available
    /// The Server took the stop and the turn is still winding down.
    case stopping
    /// The Captain is stopped and no turn runs.
    case stopped

    /// Nil when there is nothing to show: the viewer cannot stop Captains, or
    /// this one is idle.
    public static func resolve(
        availability: AgentAvailability,
        isStopPending: Bool,
        canStop: Bool
    ) -> CaptainStopPhase? {
        guard canStop else { return nil }
        if isStopPending { return .stopping }
        switch availability {
        case .stopped: return .stopped
        case .working: return .available
        case .error, .idle, .offline: return nil
        }
    }

    /// Whether a stop is still winding down after the Server answered.
    public static func isPending(_ state: AgentDeliveryState) -> Bool {
        state.stopped && state.running
    }
}
