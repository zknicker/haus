import Foundation
import HausModels
import HausUI

/// The Inbox page's inputs, projected from the Store snapshots
/// `HausStoreInbox.swift` owns. The page is a lens: nothing here loads, caches,
/// or filters on the Inbox's behalf beyond what the section's own rule is.
///
/// Each read stays nil until it lands, and that nil reaches the page as the
/// section's neutral state — an unsettled read is not an empty collection.
extension HausStore {
    /// The name the greeting addresses. Nil until the member directory lands.
    var inboxGreetingName: String? {
        guard let viewerUserID = members?.viewerUserID,
              let viewer = membersByID[viewerUserID]
        else { return nil }
        return viewer.displayName ?? viewer.handle ?? viewer.email
    }

    /// The strip's ranked Agents, sliced per Agent out of the one Server-wide
    /// usage snapshot. Nil until that snapshot lands, because ranking a
    /// half-loaded window reorders under the reader.
    func inboxAgentWeeks(asOf: Date = .now) -> [InboxAgentWeek]? {
        guard serverUsage != nil else { return nil }
        return InboxActiveAgents.rank(
            agents.map { agent in
                let week = agentUsageWeek(agentID: agent.id, asOf: asOf)
                return InboxAgentWeek(
                    id: agent.id,
                    name: agent.displayName,
                    avatarURL: resolvedAvatarURL(agent.avatarURL),
                    presence: presence(availability(for: agent)),
                    days: week?.points.map(\.tokens) ?? [],
                    totalTokens: week?.totalTokens ?? 0,
                    activityLabel: currentActivityPresentation(agentID: agent.id)?.title
                )
            }
        )
    }

    /// Open Asks and stalled claims as one list. Nil until both reads have
    /// landed: they make the same claim, so the section stays neutral rather
    /// than emptying and then filling.
    var inboxNeedsYouRows: [InboxNeedsYouRow]? {
        InboxNeedsYouRows.rows(
            asks: openAsks,
            tasks: inboxTasks,
            resolveActor: { agentID, userID in
                actorPresentation(agentID: agentID, userID: userID)
            }
        )
    }

    /// Unread Chats, newest first. The Chat list is part of the Server snapshot
    /// the shell already stands on, so it is settled whenever this page exists.
    var inboxConversationRows: [InboxConversationRow] {
        InboxConversationRows.rows(
            chats.map(inboxConversation),
            viewerDisplayName: inboxGreetingName
        )
    }

    /// Agents in a turn, from the same activity snapshot the strip's live line
    /// reads. The snapshot carries one event per Agent — the step it is on.
    var inboxWorkingAgents: [InboxWorkingAgent] {
        agents.compactMap { agent in
            guard let activity = currentActivityPresentation(agentID: agent.id) else { return nil }
            return InboxWorkingAgent(
                id: agent.id,
                name: agent.displayName,
                avatarURL: resolvedAvatarURL(agent.avatarURL),
                presence: presence(availability(for: agent)),
                step: activity.title,
                occurredAt: activity.occurredAt
            )
        }
    }

    private func inboxConversation(_ chat: ChatSummary) -> InboxConversation {
        let name: String
        let mark: InboxMark
        switch chat.kind {
        case .channel:
            name = chat.name ?? (chat.isAll ? "all" : "channel")
            mark = .channel(ChannelAppearance(icon: chat.icon, color: chat.color))
        case .dm:
            let actor = actorPresentation(agentID: chat.peerAgentID, userID: chat.peerUserID)
            name = actor?.name ?? chat.peerAgentDisplayName ?? "Direct message"
            mark = .identity(
                name: name,
                avatarURL: actor?.avatarURL,
                presence: actor?.presence
            )
        }
        return InboxConversation(
            id: chat.id,
            name: name,
            isChannel: chat.kind == .channel,
            mark: mark,
            peerDisplayName: chat.kind == .channel ? nil : name,
            unreadCount: chat.unreadCount,
            lastActivityAt: chat.lastActivityAt,
            lastMessage: chat.lastMessage
        )
    }
}
