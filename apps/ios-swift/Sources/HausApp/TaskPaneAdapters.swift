import Foundation
import HausModels
import HausUI

/// The Task pane's reads: the Task's header and starter, and the files its
/// agent wrote, from `artifact.list` filtered to that agent as creator.
extension HausStore {
    /// Nil until a read names the Task.
    func taskPane(taskID: String) -> TaskPanePresentation? {
        guard let header = taskChatHeader(taskID: taskID) else { return nil }
        let task = tasks.record(taskID: taskID)
        return TaskPanePresentation(
            taskID: taskID,
            header: header,
            starter: task.flatMap { actorPresentation(agentID: $0.captainID, userID: $0.createdBy.userID) },
            agent: TaskPaneAgent(isLoaded: task != nil, agentID: task?.agentID)
        )
    }

    /// The newest files the Task's agent created, across every folder. Nil
    /// when the read fails, which leaves the list blank.
    func taskFiles(agentID: String) async -> [DriveFilePresentation]? {
        guard let serverID = activeServer?.id,
              let input = ArtifactListInput(serverID: serverID, creator: .agent(id: agentID), limit: 100, recursive: true)
        else { return nil }
        do {
            let page = try await client.call(DriveProcedures.list, input)
            guard activeServer?.id == serverID else { return nil }
            return page.artifacts.map { DriveFilePresentation(record: $0) }
        } catch {
            Self.logger.warning("Task files read failed: \(error.localizedDescription, privacy: .public)")
            return nil
        }
    }
}
