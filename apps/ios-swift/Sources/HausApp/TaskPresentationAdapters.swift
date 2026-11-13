import Foundation
import HausModels
import HausUI

/// The Tasks destination's seam onto the Store. Reads are the Store's own
/// snapshots, so reading one from a view body tracks it and a durable event
/// repaints the screen.
extension HausStore {
    var taskBoardSource: TaskBoardSource {
        TaskBoardSource(
            boards: { [weak self] in self?.taskSnapshots.boards },
            tasks: { [weak self] boardID in self?.boardTasks(boardID: boardID) },
            detail: { [weak self] taskID in self?.taskDetail(taskID: taskID) },
            labels: { [weak self] in self?.taskSnapshots.labels ?? [] },
            assignees: { [weak self] in self?.taskAssigneeOptions ?? [] },
            actor: { [weak self] actor in
                self?.actorPresentation(agentID: actor.agentID, userID: actor.userID)
            },
            conversationLabel: { [weak self] chatID in
                self?.conversationLabel(chatID: chatID) ?? "Thread"
            },
            loadBoards: { [weak self] in try await self?.reloadBoards() },
            loadTasks: { [weak self] boardID in try await self?.reloadBoardTasks(boardID: boardID) },
            loadDetail: { [weak self] taskID in try await self?.reloadTaskDetail(taskID: taskID) },
            loadLabels: { [weak self] in try await self?.reloadTaskLabels() },
            createBoard: { [weak self] key, name in
                guard let self else { throw CancellationError() }
                return try await createBoard(key: key, name: name)
            },
            saveBoard: { [weak self] board, patch, columns in
                try await self?.saveBoard(board, patch: patch, columns: columns)
            },
            createTask: { [weak self] draft in
                guard let self else { throw CancellationError() }
                return try await createTask(draft)
            },
            updateTask: { [weak self] task, patch in
                try await self?.updateTask(task, patch: patch)
            },
            moveTask: { [weak self] task, columnID in
                try await self?.moveTask(task, toColumnID: columnID)
            },
            assignTask: { [weak self] task, assignee in
                try await self?.assignTask(task, to: assignee)
            }
        )
    }

    /// A Chat as a context label: a Channel by name, a DM as `DM`, never its
    /// peer. A Chat the list does not hold is a Thread's own.
    func conversationLabel(chatID: String) -> String {
        guard let chat = chatsByID[chatID] else { return "Thread" }
        switch chat.kind {
        case .channel: return chat.name.map { "#\($0)" } ?? "Channel"
        case .dm: return "DM"
        }
    }

    /// People first, then Agents: a Task goes to an active member or a
    /// non-retired Agent, which is what the two directories hold.
    private var taskAssigneeOptions: [TaskAssigneeOption] {
        let people = (members?.members ?? []).map { member in
            TaskAssigneeOption(
                actor: .user(userID: member.userID),
                name: member.displayName ?? member.handle ?? member.email ?? "Haus member",
                avatarURL: resolvedAvatarURL(member.avatarURL)
            )
        }
        let team = agents.map { agent in
            TaskAssigneeOption(
                actor: .agent(agentID: agent.id),
                name: agent.displayName,
                avatarURL: resolvedAvatarURL(agent.avatarURL)
            )
        }
        return people + team
    }

    /// An empty description stays off the wire, so Convert to Task gets the
    /// message's content rather than an explicit blank.
    private func createTask(_ draft: TaskDraft) async throws -> BoardTask {
        let description = draft.description.trimmingCharacters(in: .whitespacesAndNewlines)
        return try await createTask(TaskCreateInput(
            serverID: try activeServerID(),
            boardID: draft.boardID,
            title: draft.title,
            description: description.isEmpty ? nil : description,
            columnID: draft.columnID,
            assignee: draft.assignee,
            priority: draft.priority == .none ? nil : draft.priority,
            labelIDs: draft.labelIDs.isEmpty ? nil : draft.labelIDs,
            dueOn: draft.dueOn,
            sourceMessageID: draft.sourceMessageID
        ))
    }
}
