import Foundation

/// Server message search: the query, and the one Chat it is narrowed to, or
/// nil for every Chat in the Server.
public typealias MessageSearch =
    @Sendable (_ query: String, _ chatID: String?) async throws -> [MessageSearchResultPresentation]

/// A presentation-only message result. The App adapter resolves the Server's
/// message author and chat ids into this display-ready shape before handing it
/// to the view.
public struct MessageSearchResultPresentation: Identifiable, Hashable, Sendable {
    public let id: String
    public let authorName: String
    public let authorAvatarURL: URL?
    public let chatID: String
    public let chatKind: MessageSearchChatKind
    public let chatName: String
    public let content: String
    public let createdAt: Date

    public init(
        id: String,
        authorName: String,
        authorAvatarURL: URL? = nil,
        chatID: String,
        chatKind: MessageSearchChatKind = .channel,
        chatName: String,
        content: String,
        createdAt: Date
    ) {
        self.id = id
        self.authorName = authorName
        self.authorAvatarURL = authorAvatarURL
        self.chatID = chatID
        self.chatKind = chatKind
        self.chatName = chatName
        // A search result is a message excerpt, and a ```visual fence has no
        // prose to excerpt: the same rule the transcript follows applies here,
        // so the row reads the visual's name rather than its raw markup.
        self.content = VisualFence.previewText(content)
        self.createdAt = createdAt
    }
}

public enum MessageSearchChatKind: Hashable, Sendable {
    case channel
    case directMessage
}

/// Where a search looks: every Chat on the Server, or only the Chat the sheet
/// was opened from.
enum ServerSearchScope: Hashable {
    case everywhere
    case chat
}

/// Chat-name matching for the search surface.
enum ServerSearch {
    /// Chats whose name matches the query, with prefix matches first.
    static func matchingChats(_ chats: [ChatPresentation], query: String) -> [ChatPresentation] {
        let term = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !term.isEmpty else { return [] }

        let matches = chats.filter {
            $0.title.range(of: term, options: [.caseInsensitive, .diacriticInsensitive]) != nil
        }
        return matches.sorted { lhs, rhs in
            hasPrefix(lhs, term) && !hasPrefix(rhs, term)
        }
    }

    private static func hasPrefix(_ chat: ChatPresentation, _ term: String) -> Bool {
        chat.title.range(
            of: term,
            options: [.caseInsensitive, .diacriticInsensitive, .anchored]
        ) != nil
    }
}
