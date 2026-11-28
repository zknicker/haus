import Foundation

public enum ProjectText {
    public static let descriptionMaxCharacters = 500

    public static func isValidName(_ name: String) -> Bool {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.utf16.count <= 32 && trimmed.wholeMatch(of: /[A-Za-z0-9_-]+/) != nil
    }

    static func isValidDescription(_ change: NullableChange<String>?) -> Bool {
        guard case let .set(description) = change else { return true }
        return description.trimmingCharacters(in: .whitespacesAndNewlines).utf16.count <= descriptionMaxCharacters
    }
}

public struct ProjectCreateInput: Encodable, Equatable, Sendable {
    public let name: String
    public let serverID: String
    public let key: ProjectKey?
    public let color: NullableChange<String>?
    public let icon: NullableChange<String>?
    public let description: NullableChange<String>?

    public init?(
        name: String,
        serverID: String,
        key: ProjectKey? = nil,
        color: NullableChange<String>? = nil,
        icon: NullableChange<String>? = nil,
        description: NullableChange<String>? = nil
    ) {
        guard ProjectText.isValidName(name), ProjectText.isValidDescription(description) else { return nil }
        self.name = name
        self.serverID = serverID
        self.key = key
        self.color = color
        self.icon = icon
        self.description = description
    }

    enum CodingKeys: String, CodingKey {
        case name, key, color, icon, description
        case serverID = "serverId"
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(name, forKey: .name)
        try container.encode(serverID, forKey: .serverID)
        try container.encodeIfPresent(key, forKey: .key)
        try container.encodeIfPresent(color, forKey: .color)
        try container.encodeIfPresent(icon, forKey: .icon)
        try container.encodeIfPresent(description, forKey: .description)
    }
}

public struct ProjectUpdateInput: Encodable, Equatable, Sendable {
    public let chatID: String
    public let serverID: String
    public let name: String?
    public let key: ProjectKey?
    public let color: NullableChange<String>?
    public let icon: NullableChange<String>?
    public let description: NullableChange<String>?

    public init?(
        chatID: String,
        serverID: String,
        name: String? = nil,
        key: ProjectKey? = nil,
        color: NullableChange<String>? = nil,
        icon: NullableChange<String>? = nil,
        description: NullableChange<String>? = nil
    ) {
        guard name.map(ProjectText.isValidName) ?? true, ProjectText.isValidDescription(description) else { return nil }
        self.chatID = chatID
        self.serverID = serverID
        self.name = name
        self.key = key
        self.color = color
        self.icon = icon
        self.description = description
    }

    enum CodingKeys: String, CodingKey {
        case name, key, color, icon, description
        case chatID = "chatId"
        case serverID = "serverId"
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(chatID, forKey: .chatID)
        try container.encode(serverID, forKey: .serverID)
        try container.encodeIfPresent(name, forKey: .name)
        try container.encodeIfPresent(key, forKey: .key)
        try container.encodeIfPresent(color, forKey: .color)
        try container.encodeIfPresent(icon, forKey: .icon)
        try container.encodeIfPresent(description, forKey: .description)
    }
}

/// `project.setDefaultMachine`: the Machine a Task started here runs on, or none.
public struct ProjectSetDefaultMachineInput: Encodable, Equatable, Sendable {
    public let computerID: String?
    public let projectID: String
    public let serverID: String

    public init(computerID: String?, projectID: String, serverID: String) {
        self.computerID = computerID
        self.projectID = projectID
        self.serverID = serverID
    }

    enum CodingKeys: String, CodingKey {
        case computerID = "computerId"
        case projectID = "projectId"
        case serverID = "serverId"
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(computerID, forKey: .computerID)
        try container.encode(projectID, forKey: .projectID)
        try container.encode(serverID, forKey: .serverID)
    }
}
