import HausUI
import SwiftUI

/// The Tasks tab's root, reading through the store: mount it at the root of
/// the Tasks tab's stack. `filter` is the tab's, so a burst of assignment
/// pushes can land it on `.assignedToMe`.
struct TaskBoardScreen: View {
    let store: HausStore
    @Binding var filter: TaskBoardFilter
    let onOpenTask: (String) -> Void

    var body: some View {
        TaskBoardView(
            content: store.taskBoardContent(for: filter),
            filter: $filter,
            onOpenTask: onOpenTask,
            onCreateTask: { draft in
                let taskID = try await store.createTask(draft)
                onOpenTask(taskID)
            }
        )
        .task(id: TaskBoardLoad(serverID: store.scope.serverID, filter: filter)) {
            await store.loadTaskBoard(filter)
        }
    }
}

private struct TaskBoardLoad: Hashable {
    let serverID: String?
    let filter: TaskBoardFilter
}
