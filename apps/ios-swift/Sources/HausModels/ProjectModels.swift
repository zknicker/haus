import Foundation

public struct ProjectKey: Codable, Hashable, Sendable, CustomStringConvertible {
    public let rawValue: String

    public init?(_ raw: String) {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.wholeMatch(of: /[A-Z][A-Z0-9]{1,4}/) != nil else { return nil }
        rawValue = trimmed
    }

    public var description: String { rawValue }

    public static func suggested(forName name: String) -> ProjectKey? {
        let characters = name.unicodeScalars
            .filter { $0.isASCII && ($0.properties.isAlphabetic || ("0"..."9").contains($0)) }
            .map(String.init)
            .joined()
            .uppercased()
        guard let first = characters.first else { return nil }
        let base = first.isNumber ? "P\(characters)" : characters
        let padded = base.count < 2 ? base + String(repeating: "X", count: 2 - base.count) : base
        return ProjectKey(String(padded.prefix(4)))
    }

    public func suffixed(_ n: Int) -> ProjectKey? {
        let suffix = String(n)
        return ProjectKey("\(rawValue.prefix(max(0, 5 - suffix.count)))\(suffix)")
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        let raw = try container.decode(String.self)
        guard let key = ProjectKey(raw) else {
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "Invalid Project key \(raw).")
        }
        self = key
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(rawValue)
    }
}

/// The Machine a Task started in a Project runs on when its starter names none.
public struct ProjectDefaultMachine: Codable, Hashable, Sendable {
    public let computerID: String
    public let computerName: String?

    public init(computerID: String, computerName: String?) {
        self.computerID = computerID
        self.computerName = computerName
    }

    enum CodingKeys: String, CodingKey {
        case computerID = "computerId"
        case computerName
    }
}

public struct Project: Decodable, Identifiable, Hashable, Sendable {
    public let archived: Bool
    public let chatID: String
    public let defaultMachine: ProjectDefaultMachine?
    public let homeAgentIDs: [String]
    public let isHaus: Bool
    public let key: ProjectKey
    public let keyEditable: Bool
    public let name: String
    public let serverID: String
    public let taskKeyID: String

    /// A Project is its Channel: the wire names it by `chatId`, and every
    /// `projectId` input takes that id.
    public var id: String { chatID }

    enum CodingKeys: String, CodingKey {
        case archived
        case chatID = "chatId"
        case defaultMachine
        case homeAgentIDs = "homeAgentIds"
        case isHaus
        case key
        case keyEditable
        case name
        case serverID = "serverId"
        case taskKeyID = "taskKeyId"
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        archived = try container.decode(Bool.self, forKey: .archived)
        chatID = try container.decode(String.self, forKey: .chatID)
        defaultMachine = try container.decode(ProjectDefaultMachine?.self, forKey: .defaultMachine)
        homeAgentIDs = try container.decode([String].self, forKey: .homeAgentIDs)
        isHaus = try container.decode(Bool.self, forKey: .isHaus)
        key = try container.decode(ProjectKey.self, forKey: .key)
        keyEditable = try container.decode(Bool.self, forKey: .keyEditable)
        name = try container.decode(String.self, forKey: .name)
        serverID = try container.decode(String.self, forKey: .serverID)
        taskKeyID = try container.decode(String.self, forKey: .taskKeyID)
    }
}

public struct ProjectMutationResult: Decodable, Sendable {
    public let chat: ChatSummary
    public let project: Project
}

public struct ProjectDefaultMachineReceipt: Decodable, Hashable, Sendable {
    public let computerID: String?

    enum CodingKeys: String, CodingKey {
        case computerID = "computerId"
    }

    public init(from decoder: Decoder) throws {
        computerID = try decoder.container(keyedBy: CodingKeys.self).decode(String?.self, forKey: .computerID)
    }
}

public enum ProjectProcedures {
    public static let list = HausProcedure<ServerScopeInput, [Project]>.query("project.list")
    public static let create = HausProcedure<ProjectCreateInput, ProjectMutationResult>.mutation("project.create")
    public static let update = HausProcedure<ProjectUpdateInput, ProjectMutationResult>.mutation("project.update")
    public static let setDefaultMachine = HausProcedure<ProjectSetDefaultMachineInput, ProjectDefaultMachineReceipt>
        .mutation("project.setDefaultMachine")
}

public struct ProjectUpdatedEvent: Decodable, Sendable, Equatable {
    public let projectID: String
    public let serverID: String

    enum CodingKeys: String, CodingKey {
        case projectID = "projectId"
        case serverID = "serverId"
    }
}
