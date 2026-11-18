import Foundation
import HausModels
import HausUI

/// A read-only Task's seam onto the Store. Reads are the Store's own
/// snapshots, so reading one from a view body tracks it and a durable event
/// repaints the screen.
extension HausStore {
    var taskDetailSource: TaskDetailSource {
        TaskDetailSource(
            detail: { [weak self] taskID in self?.taskDetail(taskID: taskID) },
            labels: { [weak self] in self?.taskSnapshots.labels ?? [] },
            actor: { [weak self] actor in
                self?.actorPresentation(agentID: actor.agentID, userID: actor.userID)
            },
            conversationLabel: { [weak self] chatID in
                self?.conversationLabel(chatID: chatID) ?? "Chat"
            },
            descriptionBlocks: { [weak self] detail in self?.taskDescriptionBlocks(detail) ?? [] },
            loadDetail: { [weak self] taskID in try await self?.reloadTaskDetail(taskID: taskID) },
            loadLabels: { [weak self] in try await self?.reloadTaskLabels() }
        )
    }

    /// A Chat as a context label: a Channel by name, a DM as `DM`, never its
    /// peer. A Chat the list does not hold is named only as a Chat.
    func conversationLabel(chatID: String) -> String {
        guard let chat = chatsByID[chatID] else { return "Chat" }
        switch chat.kind {
        case .channel: return chat.name.map { "#\($0)" } ?? "Channel"
        case .dm: return "DM"
        case .task: return "Task"
        case .unknown: return "Chat"
        }
    }
}
