import Foundation
import HausModels
import HausUI

/// The read-only Task detail's source, over `TasksModel`'s observable
/// snapshots, so reading one from a view body tracks it and a durable event
/// repaints the screen.
extension HausStore {
    var taskDetailSource: TaskDetailSource {
        TaskDetailSource(
            detail: { [weak self] taskID in self?.taskDetail(taskID: taskID) },
            actor: { [weak self] actor in
                self?.actorPresentation(agentID: actor.agentID, userID: actor.userID)
            },
            conversationLabel: { [weak self] chatID in
                self?.conversationLabel(chatID: chatID) ?? "Chat"
            },
            descriptionBlocks: { [weak self] detail in self?.taskDescriptionBlocks(detail) ?? [] },
            loadDetail: { [weak self] taskID in try await self?.reloadTaskDetail(taskID: taskID) }
        )
    }

    /// A Chat as a context label: a Channel by name, a Captain chat by its
    /// Captain, a DM as `DM`, never its peer.
    func conversationLabel(chatID: String) -> String {
        chatsByID[chatID].map(conversationLabel) ?? "Chat"
    }
}
