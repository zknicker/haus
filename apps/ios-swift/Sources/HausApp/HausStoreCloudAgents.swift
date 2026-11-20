import Foundation
import HausModels
import HausUI
import OSLog

extension HausStore {
    func cancelCloudAgent(workID: String) async throws {
        guard let serverID = activeServer?.id else { throw HausStoreError.serverUnavailable }
        let _: CloudAgentCancelReceipt = try await client.mutation(
            "worker.stop", input: CloudAgentCancelInput(serverId: serverID, workerId: workID)
        )
    }

    /// One card for `work` as `presentingChatID` shows it. The Agent is the
    /// work's delegating Agent, never the Message that links it.
    func cloudAgentPresentation(_ work: CloudAgentWork, presentingChatID: String) -> CloudAgentPresentation {
        CloudAgentPresentation(
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

    var cloudAgentSettings: CloudAgentSettingsActions {
        CloudAgentSettingsActions(
            perform: { [weak self] computerID, operation in
                guard let self, let serverID = await self.activeServer?.id else { throw CancellationError() }
                let input = CloudAgentProviderInput(serverId: serverID, computerId: computerID)
                if operation == .get {
                    return try await self.client.query("cloudAgentProvider.get", input: input)
                }
                let result: CloudAgentCapability = try await self.client.mutation(
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
                    input: CloudAgentModelInput(serverId: serverID, model: model)
                )
            }
        )
    }
}

private struct CloudAgentCancelInput: Encodable {
    let serverId: String
    let workerId: String
}

private struct CloudAgentCancelReceipt: Decodable {
    let cancelRequested: Bool
}

private struct CloudAgentModelInput: Encodable {
    let serverId: String
    let model: CloudAgentModelSetting
}

private struct CloudAgentProviderInput: Encodable {
    let serverId: String
    let computerId: String
    let provider = "cursor"
}
