import HausModels
import HausTransport
import OSLog

private let computerLogger = Logger(subsystem: "chat.haus.ios", category: "computers")

extension HausStore {
    /// Computer visibility is role-gated by the Server. A denied or temporarily
    /// unavailable query must not make the rest of the native app fail to load.
    func loadComputers(serverID: String) async {
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
}
