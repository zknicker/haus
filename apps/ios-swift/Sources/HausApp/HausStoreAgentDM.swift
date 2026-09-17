import Foundation
import HausModels
import HausTransport

extension HausStore {
    /// Sends the first message to an Agent without creating a placeholder Chat.
    /// The Server atomically materializes the pair DM and returns its durable id.
    @discardableResult
    func sendAgentDM(_ content: String, to agentID: String) async -> String? {
        guard let serverID = activeServer?.id else { return nil }
        let content = content.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !content.isEmpty else { return nil }

        let nonce = UUID().uuidString.lowercased()
        let pendingKey = "agent-dm:\(agentID)"
        pendingMessagesByChatID[pendingKey, default: []].append(
            PendingChatMessage(
                attachments: [],
                chatID: pendingKey,
                content: content,
                createdAt: .now,
                nonce: nonce,
                inlineReply: nil
            )
        )
        sendError = nil

        do {
            let receipt: SendReceipt = try await client.mutation(
                "chat.send",
                input: SendAgentDMInput(
                    agentID: agentID,
                    content: content,
                    nonce: nonce,
                    serverID: serverID
                )
            )
            let chatID = receipt.message.chatID
            receiptBackedAgentDMsByChatID[chatID] = agentID
            adoptPendingMessages(from: pendingKey, to: chatID)
            adoptSentMessageID(receipt.message.id, nonce: nonce, in: chatID)
            await loadMessages(chatID: chatID)
            try? await reloadChats(serverID: serverID)
            return chatID
        } catch {
            removePendingMessage(nonce: nonce)
            sendError = error.localizedDescription
            return nil
        }
    }
}
