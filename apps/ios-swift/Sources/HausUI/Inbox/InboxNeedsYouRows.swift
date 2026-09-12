import Foundation
import HausModels

/// The Agent or member behind a row, as the App layer's directory resolves it.
/// Nil is an actor this client no longer lists, which each row names itself.
public typealias InboxActorResolver = (_ agentID: String?, _ userID: String?) -> MessageAuthorPresentation?

/// Work waiting on this human: open Asks addressed to them, then claims an
/// Agent took and stopped short of finishing. Two records, one list — as two
/// lists in one group the seam between them was the only place in the section
/// without a divider, and the reader could see the join.
///
/// Asks lead. An Ask is a decision only this human can make; a stalled claim is
/// work that fell over and will still be there in a minute.
public enum InboxNeedsYouRows {
    /// Nil until both reads have landed. They make the same claim — that
    /// nothing needs you — so the section stays neutral rather than emptying
    /// and then filling, exactly as the sidebar badge stays silent until the
    /// same pair can answer.
    public static func rows(
        asks: [OpenAsk]?,
        tasks: [TaskListItem]?,
        resolveActor: InboxActorResolver
    ) -> [InboxNeedsYouRow]? {
        guard let asks, let tasks else { return nil }
        // The stalled-claim question is the shared selector's, asked of the
        // Task records these rows carry, so the section and the sidebar badge
        // can never disagree about what a stalled claim is.
        let stalled = Set(InboxNeedsYou.stalledClaims(in: tasks.map(\.task)).map(\.messageID))
        return asks.map { askRow($0, resolveActor: resolveActor) }
            + tasks
                .filter { stalled.contains($0.task.messageID) }
                .map { claimRow($0, resolveActor: resolveActor) }
    }

    /// The Server already returns only the viewer's open Asks, oldest first, so
    /// nothing is filtered here.
    static func askRow(_ item: OpenAsk, resolveActor: InboxActorResolver) -> InboxNeedsYouRow {
        let resolved = resolveActor(item.ask.agentID, nil)
        let name = resolved?.name ?? authoredAgentName(item.message.author, agentID: item.ask.agentID)
        return InboxNeedsYouRow(
            id: "ask:\(item.ask.messageID)",
            mark: .identity(name: name, avatarURL: resolved?.avatarURL, presence: resolved?.presence),
            title: item.ask.title,
            preview: RichMessageParser.oneLinePreview(item.ask.summary),
            meta: "Ask · \(InboxConversationLabel.text(kind: item.chatKind, name: item.chatName))",
            open: .ask(messageID: item.ask.messageID)
        )
    }

    /// A stalled claim is where a person learns that an Agent took work and
    /// dropped it, because Chat hides an Agent's own claims by default.
    static func claimRow(_ item: TaskListItem, resolveActor: InboxActorResolver) -> InboxNeedsYouRow {
        let resolved = resolveActor(item.task.assigneeAgentID, item.task.assigneeUserID)
        let name = TaskAssigneeLabel.text(for: item, assignee: resolved)
        return InboxNeedsYouRow(
            id: "claim:\(item.message.id)",
            mark: .identity(name: name, avatarURL: resolved?.avatarURL, presence: resolved?.presence),
            title: "\(name) stopped before finishing",
            preview: RichMessageParser.oneLinePreview(item.message.content),
            meta: "\(InboxConversationLabel.text(kind: item.chatKind, name: item.chatName))"
                + " · Task #\(item.task.number)",
            open: .tasks
        )
    }

    /// The Message's own stored author profile stands in for an Agent the
    /// Server no longer lists, and its id for one that left no profile either.
    static func authoredAgentName(_ author: ChatAuthor, agentID: String) -> String {
        if case .agent(_, let profile) = author, let profile {
            return profile.displayName
        }
        return "Agent \(String(agentID.suffix(6)))"
    }
}
