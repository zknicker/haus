import Foundation

public enum AgentLifecyclePhase: String, Codable, Sendable {
    case working
    case reading
    case sending
    case settled
}

public enum AgentLifecycleOutcome: String, Codable, Sendable {
    case completed
    case failed
    case stopped
}

/// Volatile Agent execution projection. `compositionID`, `text`, and
/// `outcome` are present only for their corresponding phases on the wire.
public struct AgentLifecycleEvent: Codable, Identifiable, Sendable, Equatable {
    public let agentID: String
    public let chatID: String
    public let emittedAt: Date
    public let runID: String
    public let serverID: String
    public let phase: AgentLifecyclePhase
    public let compositionID: String?
    public let text: String?
    public let outcome: AgentLifecycleOutcome?

    enum CodingKeys: String, CodingKey {
        case agentID = "agentId"
        case chatID = "chatId"
        case emittedAt
        case runID = "runId"
        case serverID = "serverId"
        case phase
        case compositionID = "compositionId"
        case text
        case outcome
    }

    public var id: String { "\(runID):\(phase.rawValue):\(emittedAt.timeIntervalSince1970)" }

    public init(
        agentID: String,
        chatID: String,
        emittedAt: Date,
        runID: String,
        serverID: String,
        phase: AgentLifecyclePhase,
        compositionID: String? = nil,
        text: String? = nil,
        outcome: AgentLifecycleOutcome? = nil
    ) {
        self.agentID = agentID
        self.chatID = chatID
        self.emittedAt = emittedAt
        self.runID = runID
        self.serverID = serverID
        self.phase = phase
        self.compositionID = compositionID
        self.text = text
        self.outcome = outcome
    }
}

public enum ChatEventKind: String, Codable, Sendable {
    case messageCreated = "message.created"
    case cloudAgentWorkUpdated = "cloud-agent-work.updated"
    case chatRead = "chat.read"
    case askUpdated = "ask.updated"
    case threadFollowUpdated = "thread.follow.updated"
    case taskCreated = "task.created"
    case taskUpdated = "task.updated"
    case taskLabelUpdated = "task.label.updated"
    case reminderChanged = "reminder.changed"
    case chatLifecycle = "chat.lifecycle"
}

public enum ReminderAction: String, Codable, Sendable {
    case canceled
    case fired
    case scheduled
    case snoozed
    case updated
}

/// Durable Chat notification. The event log is intentionally compact; the
/// native client refetches the affected Server resource for message bodies and
/// other durable state after receiving this hint.
public struct ChatEvent: Codable, Identifiable, Sendable, Equatable {
    /// Event-specific action. Reminder actions and Chat lifecycle actions use
    /// different unions on the Server, so preserve the wire string losslessly.
    public let action: String?
    /// The Ask an `ask.updated` event names. Absent on every other kind.
    public let askID: String?
    public let chatID: String?
    public let createdAt: Date
    public let cursor: String
    public let id: String
    public let labelID: String?
    public let messageID: String?
    public let parentChatID: String?
    public let reminderID: String?
    public let sequence: Int
    public let serverID: String
    public let type: ChatEventKind

    enum CodingKeys: String, CodingKey {
        case action
        case askID = "askId"
        case chatID = "chatId"
        case createdAt
        case cursor
        case id
        case labelID = "labelId"
        case messageID = "messageId"
        case parentChatID = "parentChatId"
        case reminderID = "reminderId"
        case sequence
        case serverID = "serverId"
        case type
    }

    public init(
        action: String? = nil,
        askID: String? = nil,
        chatID: String?,
        createdAt: Date,
        cursor: String,
        id: String,
        labelID: String? = nil,
        messageID: String? = nil,
        parentChatID: String?,
        reminderID: String? = nil,
        sequence: Int,
        serverID: String,
        type: ChatEventKind
    ) {
        self.action = action
        self.askID = askID
        self.chatID = chatID
        self.createdAt = createdAt
        self.cursor = cursor
        self.id = id
        self.labelID = labelID
        self.messageID = messageID
        self.parentChatID = parentChatID
        self.reminderID = reminderID
        self.sequence = sequence
        self.serverID = serverID
        self.type = type
    }
}

/// In-memory replay state for the monotonic Server Chat event log.
///
/// A live notification can arrive while a catch-up page is being read. Cursor
/// order alone cannot deduplicate that race: receiving cursor 8 does not prove
/// that cursors 6 and 7 were delivered. Keep the cursor for the next durable
/// read and a bounded event-id window for idempotent refetch dispatch.
public struct ChatEventReplayState: Sendable, Equatable {
    public private(set) var cursor: String
    private var appliedEventIDs: Set<String>
    private var appliedEventOrder: [String]
    private let appliedEventLimit = 512

    public init(cursor: String = "0") {
        self.cursor = ChatEventCursor.normalized(cursor)
        appliedEventIDs = []
        appliedEventOrder = []
    }

    /// Records a durable event and returns `true` only for the first dispatch.
    /// Cursor advancement is immediate even for a duplicate event.
    @discardableResult
    public mutating func receive(_ event: ChatEvent) -> Bool {
        cursor = ChatEventCursor.later(cursor, event.cursor)
        guard appliedEventIDs.insert(event.id).inserted else {
            return false
        }

        appliedEventOrder.append(event.id)
        if appliedEventOrder.count > appliedEventLimit,
           let oldest = appliedEventOrder.first {
            appliedEventOrder.removeFirst()
            appliedEventIDs.remove(oldest)
        }
        return true
    }

    public mutating func advance(to cursor: String) {
        self.cursor = ChatEventCursor.later(self.cursor, cursor)
    }

    public mutating func reset(to cursor: String = "0") {
        self.cursor = ChatEventCursor.normalized(cursor)
        appliedEventIDs.removeAll(keepingCapacity: true)
        appliedEventOrder.removeAll(keepingCapacity: true)
    }
}

/// Compares the decimal-string cursors used by the Server without requiring a
/// third-party big integer implementation.
public enum ChatEventCursor {
    public static func later(_ left: String, _ right: String) -> String {
        let normalizedLeft = normalized(left)
        let normalizedRight = normalized(right)
        if normalizedLeft.count != normalizedRight.count {
            return normalizedLeft.count > normalizedRight.count ? normalizedLeft : normalizedRight
        }
        return normalizedLeft >= normalizedRight ? normalizedLeft : normalizedRight
    }

    public static func normalized(_ value: String) -> String {
        let digits = value.drop { $0 == "0" }
        return digits.isEmpty ? "0" : String(digits)
    }
}
