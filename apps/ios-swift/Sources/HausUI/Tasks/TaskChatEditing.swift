import Foundation
import HausModels

/// What the Task chat's menu changes, and the writes that do it. Each write
/// lands the Server's answer; the realtime Task events refresh the rest.
public struct TaskChatEditing {
    public let task: TaskRecord
    public let isFollowed: Bool
    public let rename: (String) async throws -> Void
    /// Archives the Task, or restores it. Restoring starts no turn.
    public let setArchived: (Bool) async throws -> Void
    public let setFollow: (Bool) async throws -> Void

    public init(
        task: TaskRecord,
        isFollowed: Bool,
        rename: @escaping (String) async throws -> Void,
        setArchived: @escaping (Bool) async throws -> Void,
        setFollow: @escaping (Bool) async throws -> Void
    ) {
        self.task = task
        self.isFollowed = isFollowed
        self.rename = rename
        self.setArchived = setArchived
        self.setFollow = setFollow
    }

    /// A Task from before Tasks had a chat takes no writes.
    var canWrite: Bool { task.chatID != nil }
}
