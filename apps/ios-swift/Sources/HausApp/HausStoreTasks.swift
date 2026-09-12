import Foundation
import HausModels

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
    /// A Server-wide read also records how many tasks the lens hid, so a
    /// surface can say "N background" without a second round trip. A
    /// Chat-scoped read leaves that count alone: it answers a different
    /// question than the Server-wide lens the Inbox and the Task list read.
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
        if chatID == nil, taskBackgroundCount != list.backgroundCount {
            taskBackgroundCount = list.backgroundCount
        }
        return list.tasks
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
