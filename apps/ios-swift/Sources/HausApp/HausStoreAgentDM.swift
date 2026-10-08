import Foundation
import HausModels
import HausTransport
import HausUI
import OSLog

extension HausStore {
    /// Sends the first message to an Agent without creating a placeholder Chat.
    /// The Server atomically materializes the pair DM and returns its durable id.
    func sendAgentDM(_ content: String, to agentID: String) async -> SendOutcome {
        guard activeServer?.id != nil else { return .rejected }
        let content = content.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !content.isEmpty else { return .rejected }

        let row = PendingChatMessage(
            attachments: [],
            chatID: "agent-dm:\(agentID)",
            content: content,
            createdAt: .now,
            nonce: UUID().uuidString.lowercased(),
            inlineReply: nil,
            target: .agentDM(agentID: agentID)
        )
        pendingMessagesByChatID[row.chatID, default: []].append(row)
        return await deliver(row)
    }

    func deliverAgentDM(_ row: PendingChatMessage, serverID: String) async -> SendOutcome {
        guard case .agentDM(let agentID) = row.target else { return .rejected }
        do {
            let client = self.client
            let input = SendAgentDMInput(
                agentID: agentID,
                content: row.content,
                nonce: row.nonce,
                serverID: serverID
            )
            // Replayed through a bad link by nonce, like every other send.
            let receipt: SendReceipt = try await IdempotentRetry.run {
                try await client.mutation("chat.send", input: input)
            }
            let chatID = receipt.message.chatID
            receiptBackedAgentDMsByChatID[chatID] = agentID
            adoptPendingMessages(from: row.chatID, to: chatID)
            adoptSentMessageID(receipt.message.id, nonce: row.nonce, in: chatID)
            await loadMessages(chatID: chatID)
            try? await reloadChats(serverID: serverID)
            return .sent(chatID: chatID)
        } catch {
            failSend(nonce: row.nonce, reason: error.localizedDescription)
            return .failed
        }
    }
}
