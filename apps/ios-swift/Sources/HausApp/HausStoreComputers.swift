import HausModels
import HausTransport
import OSLog

private let computerLogger = Logger(subsystem: "chat.haus.ios", category: "computers")

extension HausStore {
    func loadComputers(serverID: String) async {
        async let connections: Void = loadModelConnections(serverID: serverID)
        await loadComputerList(serverID: serverID)
        await connections
    }

    /// Computer visibility is role-gated by the Server. A denied or temporarily
    /// unavailable query must not make the rest of the native app fail to load.
    private func loadComputerList(serverID: String) async {
        let readStart = realtimeReconciliation.beginRead()
        do {
            let loaded: [ComputerSummary] = try await client.query(
                "computer.list",
                input: ServerScopedInput(serverId: serverID)
            )
            // An answer older than one already applied writes nothing.
            guard activeServer?.id == serverID,
                  realtimeReconciliation.landed(.computers, readStartedAt: readStart)
            else { return }
            computers = loaded
        } catch {
            computers = nil
            computerLogger.debug("Computer snapshot unavailable: \(error.localizedDescription, privacy: .public)")
        }
    }

    private func loadModelConnections(serverID: String) async {
        do {
            let loaded = try await client.call(ModelConnectionProcedures.list, ServerScopeInput(serverID: serverID))
            guard activeServer?.id == serverID else { return }
            modelConnections = loaded
        } catch {
            guard activeServer?.id == serverID else { return }
            modelConnections = nil
            computerLogger.debug("Model connections unavailable: \(error.localizedDescription, privacy: .public)")
        }
    }
}
