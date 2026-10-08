import Foundation
import HausModels
import HausUI
import OSLog

extension HausStore {
    func cancelCloudAgent(workID: String) async throws {
        guard let serverID = activeServer?.id else { throw HausStoreError.serverUnavailable }
        let _: CloudAgentCancelReceipt = try await client.mutation(
            "cloudAgentWork.cancel", input: CloudAgentCancelInput(serverId: serverID, workId: workID)
        )
    }

    func cloudAgentPresentation(_ work: CloudAgentWork) -> CloudAgentPresentation {
        CloudAgentPresentation(work: work, conversationLink: cloudAgentConversationLink(work))
    }

    func loadCloudAgentWork(serverID: String, chatID: String) async {
        do {
            let rows: [ThreadCloudAgentWork] = try await client.query(
                "cloudAgentWork.listForChat",
                input: CloudAgentChatInput(serverId: serverID, chatId: chatID)
            )
            guard activeServer?.id == serverID else { return }
            if cloudAgentWorkByChatID[chatID] != rows { cloudAgentWorkByChatID[chatID] = rows }
        } catch {
            Self.logger.error("Loading cloud agents failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    /// The App link Copy link shares, matching the web card: the
    /// conversation holding the work, which for work delegated inside a Thread
    /// is the Thread's parent Chat. The production Server origin is the App
    /// origin; a Debug build points at the local Server instead.
    private func cloudAgentConversationLink(_ work: CloudAgentWork) -> URL? {
        guard let slug = activeServer?.slug else { return nil }
        let conversationChatID = chatsByID[work.chatId] != nil ? work.chatId
            : messagesByChatID.first { $0.value.threads.contains { $0.threadChatID == work.chatId } }?.key
        guard let conversationChatID else { return nil }
        var components = URLComponents(url: HausRuntimeConfiguration.serverOrigin, resolvingAgainstBaseURL: false)
        components?.path = "/s/\(slug)/chats/\(conversationChatID)"
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

private struct CloudAgentChatInput: Encodable {
    let serverId: String
    let chatId: String
}

private struct CloudAgentCancelInput: Encodable {
    let serverId: String
    let workId: String
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
