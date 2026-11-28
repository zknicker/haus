import Foundation
import HausModels
import HausUI

extension HausStore {
    func taskChatID(taskID: String) -> String? {
        tasks.chatID(taskID: taskID) ?? transcripts.taskPreview(taskID: taskID)?.chatID
    }

    func taskID(forChatID chatID: String) -> String? {
        tasks.taskID(chatID: chatID) ?? transcripts.taskPreview(chatID: chatID)?.taskID
    }

    func opensTaskAsChat(taskID: String) -> Bool? {
        if let task = tasks.record(taskID: taskID) { return task.chatID != nil }
        return taskChatID(taskID: taskID) != nil ? true : nil
    }

    /// The header from the freshest read that names the Task. Only a Task
    /// record carries its activity; a preview says Active or Archived.
    func taskChatHeader(taskID: String) -> TaskChatHeaderPresentation? {
        if let task = tasks.record(taskID: taskID) {
            return TaskChatHeaderPresentation(task)
        }
        if let preview = transcripts.taskPreview(taskID: taskID) {
            return TaskChatHeaderPresentation(
                shortID: preview.shortID,
                title: preview.title,
                disc: TaskDiscState(isArchived: preview.isArchived, status: nil)
            )
        }
        if let task = tasks.unreadTasks?.first(where: { $0.task?.taskID == taskID })?.task {
            return TaskChatHeaderPresentation(
                shortID: task.shortID,
                title: task.title,
                disc: TaskDiscState(isArchived: task.archivedAt != nil, status: nil)
            )
        }
        return nil
    }

    func taskOrigin(taskID: String) -> TaskOrigin? {
        tasks.record(taskID: taskID)?.origin
    }

    func taskStartedFrom(taskID: String) -> TaskStartedFromPresentation? {
        guard let origin = taskOrigin(taskID: taskID) else { return nil }
        let place = chatsByID[origin.chatID].map(conversationLabel) ?? "its project"
        let message = messagesByChatID[origin.chatID]?.messages.first { $0.id == origin.messageID }
        let excerpt = message.flatMap { message -> String? in
            let line = RichMessageParser.oneLinePreview(message.content)
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

    /// Where a Chat sits, as a Task names it: `#product`, a Captain's name, or `DM`.
    func conversationLabel(_ chat: ChatSummary) -> String {
        switch chat.kind {
        case .channel: chat.name.map { "#\($0)" } ?? "its project"
        case .captain: chat.peerAgentDisplayName ?? "its Captain"
        case .dm, .unknown: "DM"
        }
    }
}
