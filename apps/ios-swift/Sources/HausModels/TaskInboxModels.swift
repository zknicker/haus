import Foundation

/// One Task assigned to the reader, as a person's Inbox item (ADR 0051): one
/// per Task, never bundled.
public struct TaskInboxItem: Decodable, Identifiable, Equatable, Sendable {
    public struct Assigner: Decodable, Equatable, Sendable {
        public enum Kind: String, Decodable, Sendable {
            case user
            case agent
        }

        public let id: String
        public let kind: Kind
        public let label: String
    }

    public let assignedAt: Date
    public let assignedBy: Assigner
    public let boardName: String
    /// The newest message referencing the Task that the reader can read. The
    /// item's composer replies in a Thread on it; nil when there is none.
    public let contextMessage: ChatMessage?
    public var task: BoardTask

    public var id: String { task.id }
}

/// `taskInbox.list`: the reader's uncleared Task items, newest assignment first.
public struct TaskInboxList: Decodable, Equatable, Sendable {
    public let items: [TaskInboxItem]
}

/// `taskInbox.clear` and `taskInbox.restore`.
public struct TaskInboxItemInput: Encodable, Equatable, Sendable {
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

public struct TaskInboxMutationResult: Decodable, Equatable, Sendable {
    /// False when the item was already in the requested state, or is gone.
    public let changed: Bool
}

/// The one-tap resolutions an Inbox item offers. Each lands on the board's
/// first column of its category and clears the item.
public enum TaskInboxResolution: CaseIterable, Hashable, Sendable {
    case start
    case done
    case wontDo

    public var category: ColumnCategory {
        switch self {
        case .start: .active
        case .done: .done
        case .wontDo: .canceled
        }
    }

    public var title: String {
        switch self {
        case .start: "Start"
        case .done: "Done"
        case .wontDo: "Won't do"
        }
    }
}
