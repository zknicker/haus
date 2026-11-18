import Foundation
import HausModels
import HausUI

/// What a Task screen reads from the Store (ADR 0052 decision 15). Each answer
/// comes from the best record held: the Task's own read, else the preview its
/// origin Channel carried, else its Unread row, so a Task opened from any of
/// them names itself before `task.get` lands.
extension HausStore {
    /// The Task's own Chat. Nil for a Task from before Tasks were places.
    func taskChatID(taskID: String) -> String? {
        taskSnapshots.detailsByID[taskID]?.task.chatID
            ?? transcripts.taskPreview(taskID: taskID)?.chatID
            ?? taskSnapshots.unreadTasks?.first { $0.task?.taskID == taskID }?.chatID
    }

    /// The Task a Chat belongs to, when the Store holds a record naming it, so
    /// a Task Chat reached by id opens as its Task.
    func taskID(forChatID chatID: String) -> String? {
        taskSnapshots.detailsByID.values.first { $0.task.chatID == chatID }?.task.id
            ?? taskSnapshots.unreadTasks?.first { $0.chatID == chatID }?.task?.taskID
            ?? transcripts.taskPreview(chatID: chatID)?.taskID
    }

    /// Whether the Task opens as a place. A Task the Server has read without
    /// a Chat is read-only history and opens its details screen.
    func opensTaskAsChat(taskID: String) -> Bool? {
        if let detail = taskSnapshots.detailsByID[taskID] { return detail.task.chatID != nil }
        return taskChatID(taskID: taskID) != nil ? true : nil
    }

    func taskChatHeader(taskID: String) -> TaskChatHeaderPresentation? {
        if let detail = taskDetail(taskID: taskID) {
            let chatID = detail.task.chatID ?? taskID
            return TaskChatHeaderPresentation(
                key: detail.task.key,
                title: detail.task.title,
                state: detail.task.state,
                attachedWork: TaskAttachedWorkPresentation(
                    cloudAgents: detail.attachedWork.map { cloudAgentPresentation($0, presentingChatID: chatID) },
                    pullRequests: detail.pullRequests
                )
            )
        }
        if let preview = transcripts.taskPreview(taskID: taskID) {
            return TaskChatHeaderPresentation(
                key: preview.key, title: preview.title, state: preview.state, attachedWork: .empty
            )
        }
        if let task = taskSnapshots.unreadTasks?.first(where: { $0.task?.taskID == taskID })?.task {
            return TaskChatHeaderPresentation(key: task.key, title: task.title, state: task.state, attachedWork: .empty)
        }
        return nil
    }

    func taskOrigin(taskID: String) -> TaskOrigin? {
        taskSnapshots.detailsByID[taskID]?.task.origin
    }

    /// Where the Task lives, under its key: its origin Channel.
    func taskContextLabel(taskID: String) -> String? {
        let originChatID = taskOrigin(taskID: taskID)?.chatID
            ?? taskSnapshots.unreadTasks?.first { $0.task?.taskID == taskID }?.task?.originChatID
        guard let chat = originChatID.flatMap({ chatsByID[$0] }), let name = chat.name else { return nil }
        return "#\(name)"
    }

    /// The "Started from" row: the origin's Channel, and the origin Message as
    /// one line once that Channel's page holds it.
    func taskStartedFrom(taskID: String) -> TaskStartedFromPresentation? {
        guard let origin = taskOrigin(taskID: taskID) else { return nil }
        let place = chatsByID[origin.chatID]?.name.map { "#\($0)" } ?? "its Channel"
        let message = messagesByChatID[origin.chatID]?.messages.first { $0.id == origin.messageID }
        let excerpt = message.flatMap { message -> String? in
            let line = RichMessageParser.oneLinePreview(message.displayContent)
            guard !line.isEmpty else { return nil }
            let author = authorPresentation(message.author)?.name ?? InboxActorName.stored(message.author)
            return "\(author): \(line)"
        }
        return TaskStartedFromPresentation(placeLabel: place, excerpt: excerpt)
    }

    /// Whether the Task's first page has landed, so the screen stops holding blank.
    func isTaskChatLoaded(chatID: String?) -> Bool {
        guard let chatID else { return false }
        return messagesByChatID[chatID] != nil
    }
}
