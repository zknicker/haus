import Foundation
import HausAppModel
import HausModels
import HausUI

/// The Task board and the Task chat's editing, read from `TasksModel` and the
/// Server directory.
extension HausStore {
    func taskBoardContent(for filter: TaskBoardFilter) -> TaskBoardContent {
        let list = tasks.list.flatMap { $0.filter == taskListFilter(filter) ? $0.tasks : nil }
        return TaskBoardContent(
            tasks: list,
            scope: TaskBoardScopeContext(
                viewerUserID: viewer.id,
                captainIDs: Set(agents.filter { $0.createdByUserID == nil || $0.createdByUserID == viewer.id }.map(\.id))
            ),
            captains: taskCaptainOptions,
            people: taskPeopleOptions,
            projects: taskProjectOptions,
            labels: tasks.labels ?? [],
            waitingOnYouTaskIDs: TaskWaitingOnYou.taskIDs(in: tasks.unreadTasks ?? [], viewerUserID: viewer.id)
        )
    }

    func taskListFilter(_ filter: TaskBoardFilter) -> TaskListFilter {
        let assignee: TaskListFilter.Assignee? = switch filter.serverAssignee(viewerUserID: viewer.id) {
        case .user(let id)?: .user(id)
        case .agent(let id)?: .agent(id)
        case .unassigned?: .unassigned
        case nil: nil
        }
        return TaskListFilter(assignee: assignee, keyID: filter.serverKeyID, states: filter.state.states)
    }

    /// Reads the board's list, its Projects, and the labels and unread Task
    /// chats its filters and "Waiting on you" draw from.
    func loadTaskBoard(_ filter: TaskBoardFilter) async {
        await tasks.loadBoard(taskListFilter(filter))
    }

    /// Starts the drafted Task and answers its id, for the caller to open.
    func createTask(_ draft: NewTaskDraft) async throws -> String {
        guard let projectID = draft.projectID, let captainID = draft.captainID else {
            throw TaskWriteError.invalidTitle
        }
        let task = try await tasks.create(
            title: draft.trimmedTitle,
            projectID: projectID,
            assigneeAgentID: captainID,
            description: draft.details
        )
        return task.id
    }

    func taskChatEditing(taskID: String) -> TaskChatEditing? {
        guard let detail = tasks.detailsByID[taskID] else { return nil }
        let task = detail.task
        return TaskChatEditing(
            task: task,
            isFollowed: detail.followed,
            captains: taskCaptainOptions,
            people: taskPeopleOptions,
            labels: tasks.labels,
            setState: { [tasks] state in try await tasks.setState(state, of: task) },
            assign: { [tasks] assignee in try await tasks.assign(assignee, to: task) },
            setFollow: { [tasks] followed in try await tasks.setFollow(followed, taskID: task.id) },
            update: { [tasks] patch in try await tasks.update(patch, of: task) },
            loadLabels: { [tasks] in await tasks.loadLabelsIfUnknown() }
        )
    }

    private var taskCaptainOptions: [TaskPersonOption] {
        agents.map { agent in
            TaskPersonOption(
                actor: .agent(agentID: agent.id),
                name: agent.displayName,
                avatarURL: resolvedAvatarURL(agent.avatarURL)
            )
        }
    }

    private var taskPeopleOptions: [TaskPersonOption] {
        (members?.members ?? []).map { member in
            TaskPersonOption(
                actor: .user(userID: member.userID),
                name: member.displayName ?? member.handle ?? "Haus member",
                avatarURL: resolvedAvatarURL(member.avatarURL)
            )
        }
    }

    private var taskProjectOptions: [TaskProjectOption] {
        (tasks.projects ?? []).filter { !$0.archived }.map { project in
            TaskProjectOption(id: project.id, name: project.name, keyID: project.taskKeyID, homeAgentIDs: project.homeAgentIDs)
        }
    }
}
