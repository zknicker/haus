import Foundation
import HausModels
import HausUI

extension HausStore {
    func taskChatID(taskID: String) -> String? {
        tasks.detailsByID[taskID]?.task.chatID
            ?? transcripts.taskPreview(taskID: taskID)?.chatID
            ?? tasks.unreadTasks?.first { $0.task?.taskID == taskID }?.chatID
    }

    func taskID(forChatID chatID: String) -> String? {
        tasks.detailsByID.values.first { $0.task.chatID == chatID }?.task.id
            ?? tasks.unreadTasks?.first { $0.chatID == chatID }?.task?.taskID
            ?? transcripts.taskPreview(chatID: chatID)?.taskID
    }

    func opensTaskAsChat(taskID: String) -> Bool? {
        if let detail = tasks.detailsByID[taskID] { return detail.task.chatID != nil }
        return taskChatID(taskID: taskID) != nil ? true : nil
    }

    func taskChatHeader(taskID: String) -> TaskChatHeaderPresentation? {
        if let detail = taskDetail(taskID: taskID) {
            return TaskChatHeaderPresentation(key: detail.task.key, title: detail.task.title, state: detail.task.state)
        }
        if let preview = transcripts.taskPreview(taskID: taskID) {
            return TaskChatHeaderPresentation(key: preview.key, title: preview.title, state: preview.state)
        }
        if let task = tasks.unreadTasks?.first(where: { $0.task?.taskID == taskID })?.task {
            return TaskChatHeaderPresentation(key: task.key, title: task.title, state: task.state)
        }
        return nil
    }

    func taskOrigin(taskID: String) -> TaskOrigin? {
        tasks.detailsByID[taskID]?.task.origin
    }

    func taskStartedFrom(taskID: String) -> TaskStartedFromPresentation? {
        guard let origin = taskOrigin(taskID: taskID) else { return nil }
        let place = chatsByID[origin.chatID]?.name.map { "#\($0)" } ?? "its project"
        let message = messagesByChatID[origin.chatID]?.messages.first { $0.id == origin.messageID }
        let excerpt = message.flatMap { message -> String? in
            let line = RichMessageParser.oneLinePreview(message.displayContent)
            guard !line.isEmpty else { return nil }
            let author = authorPresentation(message.author)?.name ?? StoredActorName.text(message.author)
            return "\(author): \(line)"
        }
        return TaskStartedFromPresentation(placeLabel: place, excerpt: excerpt)
    }

    func isTaskChatLoaded(chatID: String?) -> Bool {
        guard let chatID else { return false }
        return messagesByChatID[chatID] != nil
    }
}
