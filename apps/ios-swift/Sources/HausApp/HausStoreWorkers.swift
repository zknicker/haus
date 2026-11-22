import Foundation
import HausModels
import HausTransport
import HausUI
import OSLog

extension HausStore {
    /// One card for `work` as `presentingChatID` shows it. The Agent is the
    /// work's delegating Agent, never the Message that links it.
    func cloudAgentPresentation(_ work: Worker, presentingChatID: String) -> WorkerPresentation {
        WorkerPresentation(
            work: work,
            conversationLink: cloudAgentConversationLink(presentingChatID: presentingChatID),
            agentName: agentsByID[work.agentId]?.displayName
        )
    }

    /// The App link Copy link shares, matching the web card: the
    private func cloudAgentConversationLink(presentingChatID chatID: String) -> URL? {
        guard let slug = activeServer?.slug, chatsByID[chatID] != nil else { return nil }
        var components = URLComponents(url: HausRuntimeConfiguration.serverOrigin, resolvingAgainstBaseURL: false)
        components?.path = "/s/\(slug)/chats/\(chatID)"
        return components?.url
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
