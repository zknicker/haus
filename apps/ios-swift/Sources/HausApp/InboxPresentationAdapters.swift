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

    /// Every unread Chat and Thread and every assigned Task, newest first, less
    /// any Mark read still settling. Nil until the Chat list has landed.
    var inboxUnreadRows: [InboxUnreadRow]? {
        guard let unreadChats else { return nil }
        return InboxUnreadRows.rows(
            unreadChats.map(inboxUnreadChat),
            threads: visibleUnreadThreads.compactMap(inboxUnreadThread),
            tasks: visibleTaskInboxItems.map(inboxTaskItem),
            viewerDisplayName: inboxGreetingName
        )
    }

    private func inboxTaskItem(_ item: TaskInboxItem) -> InboxTaskItem {
        let assigner = actorPresentation(
            agentID: item.assignedBy.kind == .agent ? item.assignedBy.id : nil,
            userID: item.assignedBy.kind == .user ? item.assignedBy.id : nil
        )
        return InboxTaskItem(
            id: item.task.id,
            key: item.task.key,
            title: item.task.title,
            boardName: item.boardName,
            // The Server resolved this name; the directory only adds the face.
            assignerName: item.assignedBy.label,
            assignerAvatarURL: assigner?.avatarURL,
            assignedAt: item.assignedAt,
            priority: item.task.priority,
            dueOn: item.task.dueOn,
            columnID: item.task.columnID,
            category: item.task.category,
            columns: taskSnapshots.boards?.first { $0.id == item.task.boardID }?.columns ?? [],
            context: item.contextMessage.flatMap(inboxTaskContext)
        )
    }

    private func inboxTaskContext(_ message: ChatMessage) -> InboxTaskContext? {
        guard let author = authorPresentation(message.author) else { return nil }
        return InboxTaskContext(
            authorName: author.name,
            authorAvatarURL: author.avatarURL,
            place: conversationLabel(chatID: message.chatID),
            createdAt: message.createdAt,
            content: message.displayContent,
            acceptsReplies: chatsByID[message.chatID]?.isReadOnly != true
        )
    }

    /// What the Inbox does to a Task item, stated back as the line it shows.
    var inboxTaskActions: InboxTaskActions {
        InboxTaskActions(
            move: { [weak self] item, column in
                guard let self else { return InboxTaskNotice(message: "That didn't go through.") }
                return await resolveInboxTask(item, column: column)
            },
            markRead: { [weak self] item in
                guard let self else { return InboxTaskNotice(message: "That didn't go through.") }
                return await markInboxTaskRead(item)
            },
            undo: { [weak self] undo in await self?.undoInboxTask(undo) },
            reply: { [weak self] item, content in
                await self?.replyToTaskInboxItem(taskID: item.id, content: content) ?? false
            }
        )
    }

    private func resolveInboxTask(_ item: InboxTaskItem, column: BoardColumn) async -> InboxTaskNotice {
        do {
            let moved = try await moveTaskInboxItem(taskID: item.id, toColumnID: column.id)
            return InboxTaskNotice(
                message: "\(item.key) moved to \(column.name).",
                undo: InboxTaskUndo(taskID: item.id, moved: moved, previousColumnID: item.columnID)
            )
        } catch {
            return InboxTaskNotice(message: error.localizedDescription)
        }
    }

    private func markInboxTaskRead(_ item: InboxTaskItem) async -> InboxTaskNotice {
        do {
            try await clearTaskInboxItem(taskID: item.id)
            return InboxTaskNotice(message: "\(item.key) marked read.", undo: InboxTaskUndo(taskID: item.id))
        } catch {
            return InboxTaskNotice(message: error.localizedDescription)
        }
    }

    /// An Undo that worked says nothing: the item coming back is the answer.
    private func undoInboxTask(_ undo: InboxTaskUndo) async -> InboxTaskNotice? {
        do {
            try await undoTaskInboxClear(
                taskID: undo.taskID,
                moved: undo.moved,
                previousColumnID: undo.previousColumnID
            )
            return nil
        } catch {
            return InboxTaskNotice(message: error.localizedDescription)
        }
    }

    /// A Thread row names and wears its parent; `visibleUnreadThreads` only
    /// holds Threads whose parent is listed.
    private func inboxUnreadThread(_ thread: UnreadThread) -> InboxUnreadThread? {
        guard let parent = chatsByID[thread.parentChatID] else { return nil }
        let parentRow = inboxUnreadChat(parent)
        return InboxUnreadThread(
            id: thread.threadChatID,
            channelName: parentRow.isChannel ? parentRow.name : nil,
            mark: parentRow.mark,
            lastActivityAt: thread.lastActivityAt,
            latestReply: thread.latestReply
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

    private func inboxUnreadChat(_ chat: ChatSummary) -> InboxUnreadChat {
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
        return InboxUnreadChat(
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
