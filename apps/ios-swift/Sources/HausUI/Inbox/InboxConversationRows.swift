import Foundation
import HausModels

/// One Chat as the Conversations section reads it: the App layer has already
/// resolved the name and the mark, so the section owns only the questions that
/// are its own — which Chats are waiting, in what order, and what the quoted
/// line says.
public struct InboxConversation: Identifiable, Equatable, Sendable {
    public let id: String
    /// The Chat's own name: a Channel's name without the hash, a DM's peer.
    public let name: String
    public let isChannel: Bool
    public let mark: InboxMark
    /// The Agent or person a DM is with. In their own DM every line is theirs,
    /// so the quote does not name them again.
    public let peerDisplayName: String?
    public let unreadCount: Int
    public let lastActivityAt: Date?
    public let lastMessage: ChatLastMessage?

    public init(
        id: String,
        name: String,
        isChannel: Bool,
        mark: InboxMark,
        peerDisplayName: String?,
        unreadCount: Int,
        lastActivityAt: Date?,
        lastMessage: ChatLastMessage?
    ) {
        self.id = id
        self.name = name
        self.isChannel = isChannel
        self.mark = mark
        self.peerDisplayName = peerDisplayName
        self.unreadCount = unreadCount
        self.lastActivityAt = lastActivityAt
        self.lastMessage = lastMessage
    }
}

/// Unread conversation, newest activity first, each row quoting the line that
/// is waiting.
public enum InboxConversationRows {
    /// What a Chat holding no message yet says instead of a quote.
    public static let noActivityPreview = "no activity yet"

    public static func rows(
        _ chats: [InboxConversation],
        viewerDisplayName: String?
    ) -> [InboxConversationRow] {
        chats
            .filter { $0.unreadCount > 0 }
            .sorted { left, right in
                let leftAt = left.lastActivityAt ?? .distantPast
                let rightAt = right.lastActivityAt ?? .distantPast
                if leftAt != rightAt { return leftAt > rightAt }
                return left.id < right.id
            }
            .map { chat in
                InboxConversationRow(
                    id: chat.id,
                    mark: chat.mark,
                    title: chat.isChannel ? "#\(chat.name)" : chat.name,
                    preview: previewLine(
                        chat.lastMessage,
                        peerDisplayName: chat.isChannel ? nil : chat.peerDisplayName,
                        viewerDisplayName: viewerDisplayName
                    ) ?? noActivityPreview,
                    lastActivityAt: chat.lastActivityAt,
                    isUnread: chat.unreadCount > 0
                )
            }
    }

    /// A Chat's newest message as the one line a row quotes: who spoke, then
    /// what they said, flattened by the same helper every other quoting surface
    /// uses.
    ///
    /// The prefix is dropped when the row's own title already answers it. In a
    /// DM the peer speaks unattributed — `Tiny: Finished the audit` inside
    /// Tiny's own DM stated the name twice — and only the viewer's own line is
    /// marked, as `You:`. A Channel keeps every name, because there the author
    /// is the fact the reader is scanning for.
    ///
    /// Nil is the Chat that holds no message yet. A message whose content
    /// flattens to nothing — an attachment on its own — still names its author,
    /// which is all there is left to say about it.
    ///
    /// Authors are matched by display name because `ChatLastMessage` carries no
    /// author id. This is a presentation choice inside one row, never identity:
    /// the worst a collision does is drop or add a prefix.
    public static func previewLine(
        _ lastMessage: ChatLastMessage?,
        peerDisplayName: String?,
        viewerDisplayName: String?
    ) -> String? {
        guard let lastMessage else { return nil }
        let line = RichMessageParser.oneLinePreview(lastMessage.content)
        let prefix = authorPrefix(
            lastMessage.authorDisplayName,
            peerDisplayName: peerDisplayName,
            viewerDisplayName: viewerDisplayName
        )
        if line.isEmpty { return prefix ?? lastMessage.authorDisplayName }
        return prefix.map { "\($0): \(line)" } ?? line
    }

    static func authorPrefix(
        _ author: String,
        peerDisplayName: String?,
        viewerDisplayName: String?
    ) -> String? {
        if let viewerDisplayName, author == viewerDisplayName { return "You" }
        if let peerDisplayName, author == peerDisplayName { return nil }
        return author
    }
}
