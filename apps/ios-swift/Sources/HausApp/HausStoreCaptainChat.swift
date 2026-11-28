import Foundation
import HausModels
import HausTransport
import HausUI
import OSLog

extension HausStore {
    /// Sends to a Captain whose chat the Chat list does not hold yet. The
    /// Server resolves the Captain's one shared chat and returns its id.
    func sendCaptainChat(_ content: String, to agentID: String) async -> SendOutcome {
        guard activeServer?.id != nil else { return .rejected }
        let content = content.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !content.isEmpty else { return .rejected }

        let row = PendingChatMessage(
            attachments: [],
            chatID: "captain:\(agentID)",
            content: content,
            createdAt: .now,
            nonce: UUID().uuidString.lowercased(),
            inlineReply: nil,
            target: .captain(agentID: agentID)
        )
        pendingMessagesByChatID[row.chatID, default: []].append(row)
        return await deliver(row)
    }

    func deliverCaptainChat(_ row: PendingChatMessage, serverID: String) async -> SendOutcome {
        guard case .captain(let agentID) = row.target else { return .rejected }
        do {
            let client = self.client
            let input = SendCaptainChatInput(
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
            receiptBackedCaptainChatsByChatID[chatID] = agentID
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
