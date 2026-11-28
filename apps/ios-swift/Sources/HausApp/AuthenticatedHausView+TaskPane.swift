import HausAppModel
import HausModels
import HausUI
import SwiftUI

/// The Task beside its conversation (specs/ios-app.md, Task mode): its pane,
/// and the More menu its conversation's bar shows for it.
extension AuthenticatedHausView {
    func taskPane(_ taskID: String, tab: HausTab) -> some View {
        Group {
            if let pane = store.taskPane(taskID: taskID) {
                TaskPaneView(
                    pane: pane,
                    actions: TaskPaneActions(
                        loadFiles: { [store] agentID in await store.taskFiles(agentID: agentID) },
                        openFile: { router.present(.driveFile(path: $0.metadata.path)) },
                        close: { router.closeSidePane(tab) }
                    )
                )
                .id(taskID)
            } else {
                Color.clear
            }
        }
        .task(id: taskID) { try? await store.reloadTaskDetail(taskID: taskID) }
    }

    func taskModeChrome(_ taskID: String) -> TaskModeChromePresentation {
        let origin = store.taskOrigin(taskID: taskID)
        return TaskModeChromePresentation(
            editing: store.taskChatEditing(taskID: taskID),
            originLabel: store.taskStartedFrom(taskID: taskID)?.placeLabel,
            onOpenOrigin: {
                guard let origin else { return }
                router.open(route(forChatID: origin.chatID, messageID: origin.messageID))
            }
        )
    }
}
