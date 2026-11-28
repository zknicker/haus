import HausModels
import HausUI
import SwiftUI

/// The Tasks tab's root, reading through the store: mount it at the root of
/// the Tasks tab's stack. `view` is the router's, so it survives the tab.
struct TasksTabScreen: View {
    let store: HausStore
    @Binding var view: TaskListView
    let selectedTaskID: String?
    let onOpenTask: (String) -> Void
    let onNewTask: (() -> Void)?

    var body: some View {
        TaskListScreen(
            content: store.taskListContent(for: view),
            view: $view,
            selectedTaskID: selectedTaskID,
            onOpenTask: onOpenTask,
            onNewTask: onNewTask
        )
        .task(id: TaskListLoad(serverID: store.scope.serverID, view: view)) {
            await store.loadTaskList(view)
        }
    }
}

private struct TaskListLoad: Hashable {
    let serverID: String?
    let view: TaskListView
}
