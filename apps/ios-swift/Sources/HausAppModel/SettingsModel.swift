import Foundation
import HausModels
import HausTransport
import Observation
import OSLog

/// The Server-wide settings reads: Devices (Computers on the wire) and the
/// model connections Captains pick their models from.
@MainActor
@Observable
public final class SettingsModel {
    /// Role-gated by the Server: nil when denied or unavailable.
    public internal(set) var computers: [ComputerSummary]?
    public internal(set) var modelConnections: ModelConnectionsRead?

    @ObservationIgnored let client: TRPCClient
    @ObservationIgnored let scope: ServerScope
    @ObservationIgnored var computerReads = ReadSequence<WholeList>()
    @ObservationIgnored var connectionReads = ReadSequence<WholeList>()

    public init(client: TRPCClient, scope: ServerScope) {
        self.client = client
        self.scope = scope
    }

    public func reset() {
        computers = nil
        modelConnections = nil
        computerReads.reset()
        connectionReads.reset()
    }

    /// Both reads, side by side. A denied or failed read must not fail the
    /// rest of the app.
    public func load(serverID: String) async {
        guard scope.isActive(serverID) else { return }
        async let connections: Void = loadModelConnections()
        await loadComputers()
        await connections
    }

    public func beginComputersRead() throws -> ScopedRead<WholeList> {
        try computerReads.begin(.all, in: scope)
    }

    @discardableResult
    public func landComputers(_ loaded: [ComputerSummary]?, for read: ScopedRead<WholeList>) -> Bool {
        guard scope.accepts(read, in: computerReads, reconciling: loaded == nil ? nil : .computers) else { return false }
        if computers != loaded { computers = loaded }
        return true
    }

    public func beginModelConnectionsRead() throws -> ScopedRead<WholeList> {
        try connectionReads.begin(.all, in: scope)
    }

    @discardableResult
    public func landModelConnections(_ loaded: ModelConnectionsRead?, for read: ScopedRead<WholeList>) -> Bool {
        guard scope.accepts(read, in: connectionReads) else { return false }
        if modelConnections != loaded { modelConnections = loaded }
        return true
    }

    private func loadComputers() async {
        guard let read = try? beginComputersRead() else { return }
        do {
            let loaded: [ComputerSummary] = try await client.query(
                "computer.list",
                input: ServerScopeInput(serverID: read.serverID)
            )
            landComputers(loaded, for: read)
        } catch {
            landComputers(nil, for: read)
            Self.logger.debug("Computer snapshot unavailable: \(error.localizedDescription, privacy: .public)")
        }
    }

    private func loadModelConnections() async {
        guard let read = try? beginModelConnectionsRead() else { return }
        do {
            let loaded = try await client.call(ModelConnectionProcedures.list, ServerScopeInput(serverID: read.serverID))
            landModelConnections(loaded, for: read)
        } catch {
            landModelConnections(nil, for: read)
            Self.logger.debug("Model connections unavailable: \(error.localizedDescription, privacy: .public)")
        }
    }

    static let logger = Logger(subsystem: "chat.haus.ios", category: "computers")
}
