import Foundation
import HausModels

/// The Agent or member behind a row, as the App layer's directory resolves it.
/// Nil is an actor this client no longer lists, which each row names itself.
public typealias InboxActorResolver = (_ agentID: String?, _ userID: String?) -> MessageAuthorPresentation?

/// Conversations addressed to this human that they have not answered or marked
/// Done (ADR 0037): DM messages from someone else, and `user://` mentions of
/// them. The Server returns them newest first, so nothing is reordered here.
public enum InboxNeedsYouRows {
    /// Nil until the read has landed, so the section stays neutral rather than
    /// saying "Nothing needs you" a moment before a row arrives.
    public static func rows(
        _ rows: [NeedsYouRow]?,
        resolveActor: InboxActorResolver
    ) -> [InboxNeedsYouRow]? {
        rows?.map { row($0, resolveActor: resolveActor) }
    }

    static func row(_ item: NeedsYouRow, resolveActor: InboxActorResolver) -> InboxNeedsYouRow {
        let author = item.latest.author
        let resolved = resolveActor(author.agentID, author.userID)
        let name = resolved?.name ?? InboxActorName.stored(author)
        let context: String? = switch item.reason {
        case .dm: nil
        case .mention(let chatName), .reply(let chatName):
            InboxConversationLabel.text(kind: .channel, name: chatName)
        }
        return InboxNeedsYouRow(
            id: item.chatID,
            mark: .identity(name: name, avatarURL: resolved?.avatarURL, presence: resolved?.presence),
            title: name,
            preview: oneLine(item.latest.preview),
            context: context,
            latestAt: item.latest.createdAt,
            // A top-level row opens its DM or Channel; a Thread row pushes the
            // Thread its reply belongs in, so answering there clears the row.
            open: item.isThread ? .needsYouThread(chatID: item.chatID) : .chat(item.chatID)
        )
    }

    /// The Server's preview is plain text but may still break lines; a row is
    /// one line.
    static func oneLine(_ text: String) -> String {
        text.split(whereSeparator: \.isNewline)
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }
            .joined(separator: " ")
    }
}

extension ChatAuthor {
    var agentID: String? {
        if case .agent(let agentID, _) = self { agentID } else { nil }
    }

    var userID: String? {
        if case .human(_, let userID) = self { userID } else { nil }
    }
}
