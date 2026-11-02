import HausModels
import SwiftUI

/// The task a message inside a Thread carries, stated on that message.
///
/// An Agent may claim a message in a Thread. That task works in the Thread it
/// already sits in, so its mark says only which task and where it stands: no
/// reply count and no way in. It answers to the same Chat preference as an
/// anchor's ingress, so an Agent's claim stays hidden until the reader asks to
/// see tasks in Chat, and a task a human made always shows. The task the
/// Thread was opened for always shows: it is what the reader asked to see.
struct ThreadTaskMark: View {
    let task: TaskPresentation?
    var isOpenedTask = false
    @AppStorage(ShowTasksInChat.storageKey) private var showTasksInChat = false

    var body: some View {
        if let task = Self.stated(task, showTasksInChat: showTasksInChat, isOpenedTask: isOpenedTask) {
            HStack(spacing: 5) {
                TaskStatusDisc(status: TaskStatusShape(task.status), size: 18)
                Text("Task #\(task.number) · \(task.status.rawValue)").lineLimit(1)
            }
            .font(.subheadline)
            .foregroundStyle(.secondary)
            .padding(.top, 4)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Task number \(task.number), \(task.status.rawValue)")
        }
    }

    /// The task the mark states, or nil for a claim the reader has not asked
    /// to see.
    nonisolated static func stated(
        _ task: TaskPresentation?,
        showTasksInChat: Bool,
        isOpenedTask: Bool = false
    ) -> TaskPresentation? {
        guard let task,
              isOpenedTask
              || TaskVisibility.visibleInChat(origin: task.origin, showTasksInChat: showTasksInChat)
        else { return nil }
        return task
    }
}
