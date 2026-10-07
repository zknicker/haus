import Foundation
import HausModels
import HausUI

extension HausStore {
    var serverPresentation: ServerPresentation? {
        guard let server = activeServer else { return nil }
        return ServerPresentation(name: server.displayName)
    }

    /// Projects Server-wide message search into the native result row. Search
    /// results are limited to the active chat directory because the shell can
    /// only select chats currently mounted in its active-chat projection.
    func searchMessagePresentations(
        query: String,
        chatID: String? = nil
    ) async throws -> [MessageSearchResultPresentation] {
        guard let serverID = activeServer?.id else { return [] }
        let results = try await searchChatMessages(
            input: ChatSearchInput(query: query, serverID: serverID, chatID: chatID)
        )
        let chatsByID = Dictionary(
            chats.map { ($0.id, $0) },
            uniquingKeysWith: { active, _ in active }
        )

        return results.compactMap { result in
            guard let chat = chatsByID[result.message.chatID],
                  chat.archivedAt == nil,
                  let author = authorPresentation(result.message.author)
            else { return nil }

            let (chatName, chatKind) = searchChatPresentation(chat)
            return MessageSearchResultPresentation(
                id: result.id,
                authorName: author.name,
                authorAvatarURL: author.avatarURL,
                chatID: chat.id,
                chatKind: chatKind,
                chatName: chatName,
                content: result.message.content,
                createdAt: result.message.createdAt
            )
        }
    }

    var newChannelAgentPresentations: [NewChannelAgentPresentation] {
        agents.map { agent in
            NewChannelAgentPresentation(
                id: agent.id,
                displayName: agent.displayName,
                avatarURL: resolvedAvatarURL(agent.avatarURL)
            )
        }
    }

    func archivedChannelPresentations(serverID: String) async throws -> [ArchivedChannelPresentation] {
        try await listArchivedChats(serverID: serverID)
            .filter { $0.kind == .channel && $0.archivedAt != nil }
            .compactMap { chat in
                guard let archivedAt = chat.archivedAt else { return nil }
                return ArchivedChannelPresentation(
                    id: chat.id,
                    name: chat.name ?? (chat.isAll ? "all" : "Channel"),
                    archivedAt: archivedAt,
                    appearance: ChannelAppearance(icon: chat.icon, color: chat.color)
                )
            }
    }

    @discardableResult
    func createNativeChannel(_ draft: NewChannelDraft) async throws -> CreatedChannelPresentation {
        guard let serverID = activeServer?.id else {
            throw HausStoreError.serverUnavailable
        }
        let chat = try await createChannel(
            name: draft.name,
            agentIDs: draft.agentIDs,
            serverID: serverID
        )
        return CreatedChannelPresentation(
            id: chat.id,
            name: chat.name ?? draft.name
        )
    }

    private func searchChatPresentation(_ chat: ChatSummary) -> (String, MessageSearchChatKind) {
        switch chat.kind {
        case .channel:
            return (chat.name ?? (chat.isAll ? "all" : "Channel"), .channel)
        case .dm:
            let name = chat.peerAgentID.flatMap { agentsByID[$0]?.displayName }
                ?? chat.peerAgentDisplayName ?? "DM"
            return (name, .directMessage)
        }
    }
}
