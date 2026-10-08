import Foundation

/// One Reminder as `reminder.list` returns it (`packages/haus-api/src/reminders.ts`).
/// The phone reads the fields its Automations screen shows and ignores the rest.
public struct Reminder: Codable, Identifiable, Sendable, Equatable, Hashable {
    public enum Status: String, Codable, Sendable {
        case canceled
        case fired
        case scheduled
    }

    public let anchorChatID: String
    public let createdAt: Date
    public let description: String?
    public let fireAt: Date
    public let hasScript: Bool
    public let id: String
    public let ownerAgentID: String
    public let repeatRule: String?
    public let scriptBytes: Int
    public let status: Status
    public let timezone: String
    public let title: String
    public let version: Int

    public init(
        anchorChatID: String,
        createdAt: Date,
        description: String? = nil,
        fireAt: Date,
        hasScript: Bool = false,
        id: String,
        ownerAgentID: String,
        repeatRule: String? = nil,
        scriptBytes: Int = 0,
        status: Status = .scheduled,
        timezone: String,
        title: String,
        version: Int = 1
    ) {
        self.anchorChatID = anchorChatID
        self.createdAt = createdAt
        self.description = description
        self.fireAt = fireAt
        self.hasScript = hasScript
        self.id = id
        self.ownerAgentID = ownerAgentID
        self.repeatRule = repeatRule
        self.scriptBytes = scriptBytes
        self.status = status
        self.timezone = timezone
        self.title = title
        self.version = version
    }

    enum CodingKeys: String, CodingKey {
        case anchorChatID = "anchorChatId"
        case createdAt
        case description
        case fireAt
        case hasScript
        case id
        case ownerAgentID = "ownerAgentId"
        case repeatRule = "repeat"
        case scriptBytes
        case status
        case timezone
        case title
        case version
    }
}

/// One past run of a Reminder (`reminder.runs`), oldest first on the wire.
public struct ReminderFire: Codable, Identifiable, Sendable, Equatable {
    public let firedAt: Date
    public let id: String
    public let scheduledFor: Date

    public init(firedAt: Date, id: String, scheduledFor: Date) {
        self.firedAt = firedAt
        self.id = id
        self.scheduledFor = scheduledFor
    }
}

/// `reminder.cancel`'s answer; the phone refetches rather than patching.
public struct ReminderMutationResult: Decodable, Sendable {
    public let reminder: Reminder
}

/// One Agent-owned webhook Trigger as `trigger.list` returns it.
public struct Trigger: Codable, Identifiable, Sendable, Equatable, Hashable {
    public enum Status: String, Codable, Sendable {
        case armed
        case disabled
    }

    public let anchorChatID: String
    public let createdAt: Date
    public let createdByHandle: String?
    public let fireCount: Int
    public let id: String
    public let instruction: String?
    public let kind: String
    public let lastFiredAt: Date?
    public let status: Status
    public let title: String

    public init(
        anchorChatID: String,
        createdAt: Date,
        createdByHandle: String? = nil,
        fireCount: Int = 0,
        id: String,
        instruction: String? = nil,
        kind: String = "webhook",
        lastFiredAt: Date? = nil,
        status: Status = .armed,
        title: String
    ) {
        self.anchorChatID = anchorChatID
        self.createdAt = createdAt
        self.createdByHandle = createdByHandle
        self.fireCount = fireCount
        self.id = id
        self.instruction = instruction
        self.kind = kind
        self.lastFiredAt = lastFiredAt
        self.status = status
        self.title = title
    }

    enum CodingKeys: String, CodingKey {
        case anchorChatID = "anchorChatId"
        case createdAt
        case createdByHandle
        case fireCount
        case id
        case instruction
        case kind
        case lastFiredAt
        case status
        case title
    }
}

/// One accepted delivery to a Trigger (`trigger.runs`), newest first.
public struct TriggerFire: Codable, Identifiable, Sendable, Equatable {
    public let contentType: String?
    public let dedupeKey: String?
    public let id: String
    public let payloadBytes: Int
    public let receivedAt: Date

    public init(contentType: String?, dedupeKey: String?, id: String, payloadBytes: Int, receivedAt: Date) {
        self.contentType = contentType
        self.dedupeKey = dedupeKey
        self.id = id
        self.payloadBytes = payloadBytes
        self.receivedAt = receivedAt
    }
}
