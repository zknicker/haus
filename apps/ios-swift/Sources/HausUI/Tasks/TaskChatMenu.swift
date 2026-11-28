import HausModels
import SwiftUI

#if canImport(UIKit)
import UIKit
#endif

/// The Task chat's `…` menu, as the web App's Task menu: rename, copy its
/// reference, follow, archive or restore, and the jump to where it started.
/// Each pick hands its write to `run`, which reports a refusal.
struct TaskChatMenu: View {
    let editing: TaskChatEditing?
    /// Where the Task started, such as "#product", or nil when it is not known.
    let originLabel: String?
    let onOpenOrigin: () -> Void
    let onRename: () -> Void
    let run: (@escaping () async throws -> Void) -> Void

    var body: some View {
        Menu("Task options", systemImage: "ellipsis") {
            if let editing {
                Section {
                    if editing.canWrite {
                        Button("Rename", systemImage: "pencil", action: onRename)
                    }
                    Button("Copy reference", systemImage: "link") { copy(editing.task) }
                    if editing.canWrite {
                        Button(
                            editing.isFollowed ? "Stop following" : "Follow",
                            systemImage: editing.isFollowed ? "bell.slash" : "bell"
                        ) {
                            run { try await editing.setFollow(!editing.isFollowed) }
                        }
                    }
                }
                if editing.canWrite {
                    Section {
                        Button(
                            editing.task.isArchived ? "Restore" : "Archive",
                            systemImage: editing.task.isArchived ? "arrow.uturn.backward" : "archivebox"
                        ) {
                            run { try await editing.setArchived(!editing.task.isArchived) }
                        }
                    }
                }
            }
            if let originLabel {
                Section {
                    Button("Open \(originLabel)", systemImage: "arrow.turn.left.up", action: onOpenOrigin)
                }
            }
        }
    }

    private func copy(_ task: TaskRecord) {
        #if canImport(UIKit)
        UIPasteboard.general.string = TaskReference.markdown(task)
        #endif
    }
}
