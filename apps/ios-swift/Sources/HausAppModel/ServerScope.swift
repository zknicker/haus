import Foundation
import HausModels
import Observation

/// The Server every read, event, and write is scoped to, shared by the
/// per-noun models. A switch advances the generation, so a read that began
/// before it can never land after it, even on a return to the same Server.
@MainActor
@Observable
public final class ServerScope {
    public private(set) var serverID: String?
    @ObservationIgnored public private(set) var generation = 0
    /// Stream-start reconciliation for the active Server's projections.
    @ObservationIgnored public var reconciliation = RealtimeReconciliation()

    public init(serverID: String? = nil) {
        self.serverID = serverID
    }

    /// Makes `serverID` the active Server. Activating the Server already
    /// active keeps every ticket current.
    public func activate(_ serverID: String?) {
        guard self.serverID != serverID else { return }
        self.serverID = serverID
        generation += 1
    }

    public var ticket: ServerTicket? {
        serverID.map { ServerTicket(serverID: $0, generation: generation) }
    }

    public func requireTicket() throws -> ServerTicket {
        guard let ticket else { throw ServerScopeError.serverUnavailable }
        return ticket
    }

    public func isCurrent(_ ticket: ServerTicket) -> Bool {
        ticket.serverID == serverID && ticket.generation == generation
    }

    public func isActive(_ serverID: String) -> Bool {
        self.serverID == serverID
    }
}

/// One Server activation. A read carries the ticket it began under and lands
/// only while that ticket is still current.
public struct ServerTicket: Hashable, Sendable {
    public let serverID: String
    public let generation: Int
}

public enum ServerScopeError: LocalizedError, Equatable {
    case serverUnavailable

    public var errorDescription: String? {
        "The active Haus Server is no longer available."
    }
}
