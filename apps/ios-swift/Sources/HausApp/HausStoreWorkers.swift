import Foundation
import HausModels
import HausTransport
import HausUI
import OSLog

extension HausStore {
    /// One Worker under the Message that links it. The Agent is the work's
    /// delegating Agent, never the Message that links it.
    func cloudAgentPresentation(_ work: Worker) -> WorkerPresentation {
        WorkerPresentation(work: work, agentName: agentsByID[work.agentId]?.displayName)
    }

    var cloudAgentSettings: WorkerSettingsActions {
        WorkerSettingsActions(
            perform: { [weak self] computerID, operation in
                guard let self, let serverID = await self.activeServer?.id else { throw CancellationError() }
                let input = WorkerProviderInput(serverId: serverID, computerId: computerID)
                if operation == .get {
                    return try await self.client.query("cloudAgentProvider.get", input: input)
                }
                let result: WorkerCapability = try await self.client.mutation(
                    "cloudAgentProvider.\(operation.rawValue)", input: input, timeout: 360
                )
                await self.loadComputers(serverID: serverID)
                return result
            },
            loadModel: { [weak self] in
                guard let self, let serverID = await self.activeServer?.id else { throw CancellationError() }
                return try await self.client.query(
                    "cloudAgentSettings.get", input: ServerScopedInput(serverId: serverID)
                )
            },
            setModel: { [weak self] model in
                guard let self, let serverID = await self.activeServer?.id else { throw CancellationError() }
                return try await self.client.mutation(
                    "cloudAgentSettings.setModel",
                    input: WorkerModelInput(serverId: serverID, model: model)
                )
            }
        )
    }
}

private struct WorkerModelInput: Encodable {
    let serverId: String
    let model: WorkerModelSetting
}

private struct WorkerProviderInput: Encodable {
    let serverId: String
    let computerId: String
    let provider = "cursor"
}
