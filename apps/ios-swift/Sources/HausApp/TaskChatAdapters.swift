import Foundation
import HausModels
import HausUI

extension HausStore {
    func taskChatID(taskID: String) -> String? {
        taskSnapshots.detailsByID[taskID]?.task.chatID
            ?? transcripts.taskPreview(taskID: taskID)?.chatID
            ?? taskSnapshots.unreadTasks?.first { $0.task?.taskID == taskID }?.chatID
    }

    func taskID(forChatID chatID: String) -> String? {
        taskSnapshots.detailsByID.values.first { $0.task.chatID == chatID }?.task.id
            ?? taskSnapshots.unreadTasks?.first { $0.chatID == chatID }?.task?.taskID
            ?? transcripts.taskPreview(chatID: chatID)?.taskID
    }

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

    func taskContextLabel(taskID: String) -> String? {
        let originChatID = taskOrigin(taskID: taskID)?.chatID
            ?? taskSnapshots.unreadTasks?.first { $0.task?.taskID == taskID }?.task?.originChatID
        guard let chat = originChatID.flatMap({ chatsByID[$0] }), let name = chat.name else { return nil }
        return "#\(name)"
    }

    func taskStartedFrom(taskID: String) -> TaskStartedFromPresentation? {
        guard let origin = taskOrigin(taskID: taskID) else { return nil }
        let place = chatsByID[origin.chatID]?.name.map { "#\($0)" } ?? "its project"
        let message = messagesByChatID[origin.chatID]?.messages.first { $0.id == origin.messageID }
        let excerpt = message.flatMap { message -> String? in
            let line = RichMessageParser.oneLinePreview(message.displayContent)
            guard !line.isEmpty else { return nil }
            let author = authorPresentation(message.author)?.name ?? InboxActorName.stored(message.author)
            return "\(author): \(line)"
        }
        return TaskStartedFromPresentation(placeLabel: place, excerpt: excerpt)
    }

    func isTaskChatLoaded(chatID: String?) -> Bool {
        guard let chatID else { return false }
        return messagesByChatID[chatID] != nil
    }
}
