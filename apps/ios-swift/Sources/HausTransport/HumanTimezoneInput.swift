import Foundation

/// Input for `member.setTimezone`: a human sets only their own zone.
public struct SetHumanTimezoneInput: Encodable, Equatable, Sendable {
    public let serverID: String
    public let timezone: String

    public init(serverID: String, timezone: String) {
        self.serverID = serverID
        self.timezone = timezone
    }

    private enum CodingKeys: String, CodingKey {
        case serverID = "serverId"
        case timezone
    }
}
