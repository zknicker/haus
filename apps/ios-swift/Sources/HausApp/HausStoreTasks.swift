import Foundation
import HausModels
import HausUI

/// Server-backed task reads and lifecycle mutations for native task lenses.
///
/// The store intentionally returns authoritative projections instead of
/// maintaining a second task cache. A parent surface can keep the returned
/// snapshot in its own view state and replace it after each mutation.
extension HausStore {
    /// The tasks a lens shows. The default lens is the tracked tier alone;
    /// `includeBackground` widens it to the bookkeeping claims an Agent settles
    /// inside one turn.
    ///
    /// The Server-wide default lens also records how many tasks it hid, so a
    /// surface can say "N background" without a second round trip. Every other
    /// read leaves that count alone (`TaskBackgroundLens.recordsHiddenCount`):
    /// a Chat-scoped read answers a different question, and a widened read
    /// hides nothing and so reports zero — recording that would take the
    /// number off the one control that leads back out of the widened lens.
    func loadTasks(
        chatID: String? = nil,
        includeBackground: Bool = false
    ) async throws -> [TaskListItem] {
        guard let serverID = activeServer?.id else {
            throw HausStoreError.serverUnavailable
        }
        let list: TaskList = try await client.query(
            "task.list",
            input: TaskListInput(
                serverID: serverID,
                chatID: chatID,
                includeBackground: includeBackground ? true : nil
            )
        )
        if TaskBackgroundLens.recordsHiddenCount(chatID: chatID, includeBackground: includeBackground),
           taskBackgroundCount != list.backgroundCount {
            taskBackgroundCount = list.backgroundCount
        }
        return list.tasks
    }

    /// Reloads the lens a task surface is showing.
    ///
    /// The default lens is the Server-wide read the Store already owns, so it
    /// lands on that one snapshot and every surface reading it repaints. The
    /// widened lens is one reader's temporary question, so it is only returned.
    func reloadTaskLens(includeBackground: Bool) async throws -> [TaskListItem] {
        if includeBackground {
            return try await loadTasks(includeBackground: true)
        }
        let rows = try await loadTasks()
        if inboxTasks != rows { inboxTasks = rows }
        return rows
    }

    @discardableResult
    func updateTaskStatus(_ task: MessageTask, status: TaskStatus) async throws -> MessageTask {
        guard let serverID = activeServer?.id else {
            throw HausStoreError.serverUnavailable
        }
        let receipt: TaskMutationReceipt = try await client.mutation(
            "task.update",
            input: TaskUpdateInput(
                serverID: serverID,
                messageID: task.messageID,
                expectedVersion: task.version,
                patch: TaskUpdatePatch(status: status)
            )
        )
        return receipt.task
    }

    @discardableResult
    func claimTask(_ task: MessageTask) async throws -> MessageTask {
        try await mutateTask(task, procedure: "task.claim")
    }

    @discardableResult
    func unclaimTask(_ task: MessageTask) async throws -> MessageTask {
        try await mutateTask(task, procedure: "task.unclaim")
    }

    private func mutateTask(
        _ task: MessageTask,
        procedure: String
    ) async throws -> MessageTask {
        guard let serverID = activeServer?.id else {
            throw HausStoreError.serverUnavailable
        }
        let receipt: TaskMutationReceipt = try await client.mutation(
            procedure,
            input: TaskMutationInput(
                serverID: serverID,
                messageID: task.messageID,
                expectedVersion: task.version
            )
        )
        return receipt.task
    }
}
