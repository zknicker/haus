import Foundation
import HausAppModel
import HausModels
import HausUI

/// Home's and Projects' rows, from the Chat list, the Captains and their live
/// work, the active Tasks, and the Projects.
extension HausStore {
    func captainIdentity(_ agent: AgentSummary) -> CaptainIdentity {
        CaptainIdentity(id: agent.id, name: agent.displayName, avatarURL: resolvedAvatarURL(agent.avatarURL))
    }

    var captainTiles: [CaptainTilePresentation] {
        let unreadAgentIDs = Set((unreadChats ?? []).compactMap(\.captainID))
        return agents.map { agent in
            let presence = presence(availability(for: agent))
            return CaptainTilePresentation(
                captain: captainIdentity(agent),
                isWorking: presence == .working || currentActivityByAgentID[agent.id] != nil,
                isUnread: unreadAgentIDs.contains(agent.id),
                isResting: CaptainTilePresentation.isResting(presence)
            )
        }
    }

    /// Nil until the Chat list has landed.
    var homeRecentRows: [HomeRowPresentation]? {
        guard let unreadChats else { return nil }
        let activeChatIDs = Set((tasks.activeTasks ?? []).compactMap(\.chatID))
        return HomeRecent.items(
            chats: chats,
            unreadChatIDs: Set(unreadChats.map(\.id)),
            unreadTasks: tasks.unreadTasks ?? [],
            activeTaskChatIDs: activeChatIDs
        )
        .map(homeRow)
    }

    /// Nil until `task.listActive` has landed. A crew Task names its Captain;
    /// one a person started names them.
    var homeActiveTaskRows: [HomeRowPresentation]? {
        tasks.activeTasks?.map { task in
            let captain = task.captainID.flatMap { agentsByID[$0] }.map(captainIdentity)
            let starter = captain?.name ?? task.createdBy.userID.map(personName)
            let disc = TaskDiscState(task)
            return HomeRowPresentation(
                id: task.id,
                lead: .task(disc),
                title: task.title,
                subtitle: [starter, disc.label].compactMap(\.self).joined(separator: " · "),
                metaCaptain: captain,
                time: task.createdAt,
                timePlacement: .meta,
                isUnread: task.chatID.map(isUnreadTaskChat) ?? false,
                target: .task(task.id),
                markReadChatID: task.chatID
            )
        }
    }

    var projectRows: [ProjectRowPresentation] {
        let counts = tasks.activeTasks.map(ProjectTaskCounts.active)
        let unreadIDs = Set((unreadChats ?? []).map(\.id))
        return chats
            .filter { $0.kind == .channel }
            .map { chat in
                ProjectRowPresentation(
                    chatID: chat.id,
                    name: chat.name ?? (chat.isAll ? "all" : "Project"),
                    appearance: ChannelAppearance(icon: chat.icon, color: chat.color),
                    isAll: chat.isAll,
                    captains: chat.participantAgentIDs.compactMap { agentsByID[$0] }.map(captainIdentity),
                    openTaskCount: counts.map { $0[chat.id] ?? 0 },
                    lastActivityAt: chat.lastMessage?.createdAt ?? chat.lastActivityAt,
                    isUnread: unreadIDs.contains(chat.id),
                    projectID: projects.project(chatID: chat.id)?.id
                )
            }
            .sorted { ($0.lastActivityAt ?? .distantPast) > ($1.lastActivityAt ?? .distantPast) }
    }

    var personRows: [PersonRowPresentation] {
        let unreadIDs = Set((unreadChats ?? []).map(\.id))
        return chats.compactMap { chat in
            guard chat.kind == .dm, let userID = chat.peerUserID else { return nil }
            return PersonRowPresentation(
                chatID: chat.id,
                name: personName(userID),
                avatarURL: resolvedAvatarURL(membersByID[userID]?.avatarURL),
                isUnread: unreadIDs.contains(chat.id)
            )
        }
    }

    private func homeRow(_ item: HomeRecent.Item) -> HomeRowPresentation {
        switch item {
        case let .chat(chat, isUnread):
            HomeRowPresentation(
                id: chat.id,
                lead: lead(for: chat),
                title: title(for: chat),
                subtitle: chat.lastMessage.map {
                    HomeRowPresentation.preview($0.content, author: chat.kind == .channel ? $0.authorDisplayName : nil)
                } ?? "",
                time: item.activityAt,
                isUnread: isUnread,
                target: chat.captainID.map(HomeRowTarget.captain) ?? .chat(chat.id),
                markReadChatID: chat.id
            )
        case let .task(preview):
            HomeRowPresentation(
                id: preview.chatID,
                lead: .task(taskDisc(preview.task)),
                title: preview.task?.title ?? "Task",
                subtitle: preview.messages.last.map { HomeRowPresentation.preview($0.content, author: nil) } ?? "",
                time: item.activityAt,
                isUnread: true,
                target: preview.task.map { .task($0.taskID) } ?? .chat(preview.chatID),
                markReadChatID: preview.chatID
            )
        }
    }

    /// An unread Task row's disc: its activity when this client holds the
    /// Task, else only whether it is archived.
    private func taskDisc(_ task: ChatUnreadPreviewTask?) -> TaskDiscState {
        guard let task else { return .active(nil) }
        if let record = tasks.record(taskID: task.taskID) { return TaskDiscState(record) }
        return TaskDiscState(isArchived: task.archivedAt != nil, status: nil)
    }

    private func lead(for chat: ChatSummary) -> HomeRowLead {
        if let agentID = chat.captainID {
            return .captain(agentsByID[agentID].map(captainIdentity)
                ?? CaptainIdentity(id: agentID, name: title(for: chat), avatarURL: nil))
        }
        if let userID = chat.peerUserID {
            return .person(name: personName(userID), avatarURL: resolvedAvatarURL(membersByID[userID]?.avatarURL))
        }
        return .project(ChannelAppearance(icon: chat.icon, color: chat.color))
    }

    private func title(for chat: ChatSummary) -> String {
        if let agentID = chat.captainID {
            return agentsByID[agentID]?.displayName ?? chat.peerAgentDisplayName ?? "Former Captain"
        }
        if let userID = chat.peerUserID { return personName(userID) }
        return chat.name ?? (chat.isAll ? "all" : "Project")
    }

    private func personName(_ userID: String) -> String {
        let member = membersByID[userID]
        return member?.displayName ?? member?.handle ?? member?.email ?? "Former member"
    }
}
