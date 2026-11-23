import Foundation

public enum WorkerPlaceTarget: Codable, Hashable, Sendable {
    case computer(id: String)
    case cursor
    case claude

    enum CodingKeys: String, CodingKey {
        case computerID = "computerId"
        case kind
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        switch try container.decode(String.self, forKey: .kind) {
        case "computer": self = .computer(id: try container.decode(String.self, forKey: .computerID))
        case "cursor": self = .cursor
        case "claude": self = .claude
        case let kind:
            throw DecodingError.dataCorruptedError(
                forKey: .kind, in: container, debugDescription: "Unknown Worker place \(kind)."
            )
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        switch self {
        case let .computer(id):
            try container.encode("computer", forKey: .kind)
            try container.encode(id, forKey: .computerID)
        case .cursor: try container.encode("cursor", forKey: .kind)
        case .claude: try container.encode("claude", forKey: .kind)
        }
    }
}

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

public struct ProjectRepoInput: Encodable, Equatable, Sendable {
    public let projectID: String
    public let repository: String
    public let serverID: String

    public init?(projectID: String, repository: String, serverID: String) {
        let trimmed = repository.trimmingCharacters(in: .whitespacesAndNewlines)
        guard (3...200).contains(trimmed.utf16.count),
              trimmed.wholeMatch(of: /[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+/) != nil
        else { return nil }
        self.projectID = projectID
        self.repository = trimmed
        self.serverID = serverID
    }

    enum CodingKeys: String, CodingKey {
        case projectID = "projectId"
        case repository
        case serverID = "serverId"
    }
}

public struct ProjectRepoTarget: Encodable, Equatable, Sendable {
    public let projectRepoID: String
    public let serverID: String

    public init(projectRepoID: String, serverID: String) {
        self.projectRepoID = projectRepoID
        self.serverID = serverID
    }

    enum CodingKeys: String, CodingKey {
        case projectRepoID = "projectRepoId"
        case serverID = "serverId"
    }
}

public struct ProjectRepoLinkInput: Encodable, Equatable, Sendable {
    public let checkoutPath: String?
    public let computerID: String
    public let projectRepoID: String
    public let serverID: String

    public init(checkoutPath: String?, computerID: String, projectRepoID: String, serverID: String) {
        self.checkoutPath = checkoutPath
        self.computerID = computerID
        self.projectRepoID = projectRepoID
        self.serverID = serverID
    }

    enum CodingKeys: String, CodingKey {
        case checkoutPath
        case computerID = "computerId"
        case projectRepoID = "projectRepoId"
        case serverID = "serverId"
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(checkoutPath, forKey: .checkoutPath)
        try container.encode(computerID, forKey: .computerID)
        try container.encode(projectRepoID, forKey: .projectRepoID)
        try container.encode(serverID, forKey: .serverID)
    }
}

public struct ProjectRepoUnlinkInput: Encodable, Equatable, Sendable {
    public let computerID: String
    public let projectRepoID: String
    public let serverID: String

    public init(computerID: String, projectRepoID: String, serverID: String) {
        self.computerID = computerID
        self.projectRepoID = projectRepoID
        self.serverID = serverID
    }

    enum CodingKeys: String, CodingKey {
        case computerID = "computerId"
        case projectRepoID = "projectRepoId"
        case serverID = "serverId"
    }
}

public struct ProjectDefaultWorkerPlaceInput: Encodable, Equatable, Sendable {
    public let place: WorkerPlaceTarget?
    public let projectID: String
    public let serverID: String

    public init(place: WorkerPlaceTarget?, projectID: String, serverID: String) {
        self.place = place
        self.projectID = projectID
        self.serverID = serverID
    }

    enum CodingKeys: String, CodingKey {
        case place
        case projectID = "projectId"
        case serverID = "serverId"
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(place, forKey: .place)
        try container.encode(projectID, forKey: .projectID)
        try container.encode(serverID, forKey: .serverID)
    }
}
