import Foundation

// Focused realtime payloads about the Server itself, not any one Chat
// (specs/realtime-events.md). The Store answers each with a read of its own, so
// these never pass through the Chat event batch.

/// `server.onUpdated`: the Server's name or membership changed. The stream is
/// also the membership sentinel; its refusal, not this payload, reports loss.
public struct ServerUpdatedEvent: Decodable, Sendable, Equatable {
    public let serverID: String

    public init(serverID: String) {
        self.serverID = serverID
    }

    enum CodingKeys: String, CodingKey {
        case serverID = "serverId"
    }
}

/// `computer.onUpdated`: a Computer attached, detached, reported, or moved
/// its update. Nil `computerID` means a change broader than one Computer.
public struct ComputerUpdatedEvent: Decodable, Sendable, Equatable {
    public let computerID: String?
    public let serverID: String

    public init(computerID: String?, serverID: String) {
        self.computerID = computerID
        self.serverID = serverID
    }

    enum CodingKeys: String, CodingKey {
        case computerID = "computerId"
        case serverID = "serverId"
    }
}
