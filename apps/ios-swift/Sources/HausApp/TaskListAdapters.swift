import Foundation
import HausAppModel
import HausModels
import HausUI

/// The Tasks tab and the Task chat's editing, read from `TasksModel` and the
/// Server directory.
extension HausStore {
    func taskListContent(for view: TaskListView) -> TaskListContent {
        let list = tasks.list.flatMap { $0.archived == view.isArchived ? $0.tasks : nil }
        return TaskListContent(
            tasks: list,
            viewerUserID: viewer.id,
            projectNames: Dictionary((tasks.projects ?? []).map { ($0.id, "#\($0.name)") }) { first, _ in first },
            machineNames: Dictionary((computers ?? []).map { ($0.id, $0.name ?? "Device") }) { first, _ in first },
            modelLabels: taskModelLabels,
            unreadTaskIDs: Set((tasks.unreadTasks ?? []).compactMap(\.task?.taskID))
        )
    }

    /// Reads the tab's list, plus the Projects and Devices its rows name.
    func loadTaskList(_ view: TaskListView) async {
        guard let serverID = activeServer?.id else { return }
        await withTaskGroup(of: Void.self) { group in
            group.addTask { await self.tasks.loadList(archived: view.isArchived) }
            if computers == nil {
                group.addTask { await self.loadComputers(serverID: serverID) }
            }
        }
    }

    func taskChatEditing(taskID: String) -> TaskChatEditing? {
        guard let detail = tasks.detailsByID[taskID] else { return nil }
        let task = detail.task
        return TaskChatEditing(
            task: task,
            isFollowed: detail.followed,
            rename: { [tasks] title in try await tasks.rename(task, to: title) },
            setArchived: { [tasks] archived in try await tasks.setArchived(archived, of: task) },
            setFollow: { [tasks] followed in try await tasks.setFollow(followed, taskID: task.id) }
        )
    }

    /// Model labels from the runner's catalog, by model id.
    var taskModelLabels: [String: String] {
        let models = (modelConnections?.runtimeCatalog ?? []).flatMap(\.models)
        return Dictionary(models.map { ($0.id, $0.label) }) { first, _ in first }
    }
}
