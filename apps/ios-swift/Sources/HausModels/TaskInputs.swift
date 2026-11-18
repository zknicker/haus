import Foundation

/// `task.get`.
public struct TaskGetInput: Encodable, Equatable, Sendable {
    public let serverID: String
    public let taskID: String

    public init(serverID: String, taskID: String) {
        self.serverID = serverID
        self.taskID = taskID
    }

    enum CodingKeys: String, CodingKey {
        case serverID = "serverId"
        case taskID = "taskId"
    }
}
