import Foundation
import HausModels
import HausUI

extension HausStore {
    var serverPresentation: ServerPresentation? {
        guard let server = activeServer else { return nil }
        return ServerPresentation(name: server.displayName)
    }

    /// Projects Server-wide message search into the native result row. Search
    /// results are limited to the active chat directory and the Tasks the app
    /// holds, the places a result can open.
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
            guard let (chatName, chatKind) = searchPlace(result, chat: chatsByID[result.message.chatID]),
                  let author = authorPresentation(result.message.author)
            else { return nil }

            return MessageSearchResultPresentation(
                id: result.id,
                authorName: author.name,
                authorAvatarURL: author.avatarURL,
                chatID: result.message.chatID,
                chatKind: chatKind,
                chatName: chatName,
                content: result.message.content,
                createdAt: result.message.createdAt
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
                    name: chat.name ?? (chat.isAll ? "all" : "Project"),
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
        let chat = try await createChannel(name: draft.name, serverID: serverID)
        return CreatedChannelPresentation(
            id: chat.id,
            name: chat.name ?? draft.name
        )
    }

    private func searchPlace(_ result: ChatSearchResult, chat: ChatSummary?) -> (String, MessageSearchChatKind)? {
        if let chat {
            return chat.archivedAt == nil ? searchChatPresentation(chat) : nil
        }
        guard result.chatArchivedAt == nil,
              let shortID = result.taskShortID,
              taskID(forChatID: result.message.chatID) != nil
        else { return nil }
        return (shortID, .task)
    }

    private func searchChatPresentation(_ chat: ChatSummary) -> (String, MessageSearchChatKind) {
        switch chat.kind {
        case .channel:
            return (chat.name ?? (chat.isAll ? "all" : "Project"), .channel)
        case .captain:
            let name = chat.captainID.flatMap { agentsByID[$0]?.displayName }
                ?? chat.peerAgentDisplayName ?? "Captain"
            return (name, .directMessage)
        case .dm:
            let name = chat.peerUserID.flatMap { membersByID[$0] }.flatMap { $0.displayName ?? $0.handle } ?? "DM"
            return (name, .directMessage)
        case .unknown:
            return (chat.name ?? "Chat", .channel)
        }
    }
}
