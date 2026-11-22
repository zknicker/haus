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

public struct ProjectRepoLink: Decodable, Hashable, Sendable {
    public let checkoutPath: String?
    public let computerID: String
    public let computerName: String?

    enum CodingKeys: String, CodingKey {
        case checkoutPath
        case computerID = "computerId"
        case computerName
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        checkoutPath = try container.decode(String?.self, forKey: .checkoutPath)
        computerID = try container.decode(String.self, forKey: .computerID)
        computerName = try container.decode(String?.self, forKey: .computerName)
    }
}

public struct ProjectRepo: Decodable, Identifiable, Hashable, Sendable {
    public let id: String
    public let links: [ProjectRepoLink]
    public let repository: String
}

public struct Project: Decodable, Identifiable, Hashable, Sendable {
    public let archived: Bool
    public let chatID: String
    public let defaultWorkerPlace: WorkerPlace?
    public let homeAgentIDs: [String]
    public let isHaus: Bool
    public let key: ProjectKey
    public let keyEditable: Bool
    public let name: String
    public let repos: [ProjectRepo]
    public let serverID: String
    public let taskKeyID: String

    /// A Project is its Channel: the wire names it by `chatId`, and every
    /// `projectId` input takes that id.
    public var id: String { chatID }

    enum CodingKeys: String, CodingKey {
        case archived
        case chatID = "chatId"
        case defaultWorkerPlace
        case homeAgentIDs = "homeAgentIds"
        case isHaus
        case key
        case keyEditable
        case name
        case repos
        case serverID = "serverId"
        case taskKeyID = "taskKeyId"
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        archived = try container.decode(Bool.self, forKey: .archived)
        chatID = try container.decode(String.self, forKey: .chatID)
        defaultWorkerPlace = try container.decode(WorkerPlace?.self, forKey: .defaultWorkerPlace)
        homeAgentIDs = try container.decode([String].self, forKey: .homeAgentIDs)
        isHaus = try container.decode(Bool.self, forKey: .isHaus)
        key = try container.decode(ProjectKey.self, forKey: .key)
        keyEditable = try container.decode(Bool.self, forKey: .keyEditable)
        name = try container.decode(String.self, forKey: .name)
        repos = try container.decode([ProjectRepo].self, forKey: .repos)
        serverID = try container.decode(String.self, forKey: .serverID)
        taskKeyID = try container.decode(String.self, forKey: .taskKeyID)
    }
}

public struct ProjectMutationResult: Decodable, Sendable {
    public let chat: ChatSummary
    public let project: Project
}

public struct ProjectRepoAdded: Decodable, Hashable, Sendable {
    public let projectRepoID: String
    public let repository: String

    enum CodingKeys: String, CodingKey {
        case projectRepoID = "projectRepoId"
        case repository
    }
}

public struct ProjectRepoLinkReceipt: Decodable, Hashable, Sendable {
    public let computerID: String
    public let projectRepoID: String

    enum CodingKeys: String, CodingKey {
        case computerID = "computerId"
        case projectRepoID = "projectRepoId"
    }
}

public struct ProjectRepoRemoved: Decodable, Hashable, Sendable {
    public let projectRepoID: String

    enum CodingKeys: String, CodingKey {
        case projectRepoID = "projectRepoId"
    }
}

public struct ProjectDefaultWorkerPlace: Decodable, Hashable, Sendable {
    public let place: WorkerPlaceTarget?

    enum CodingKeys: String, CodingKey {
        case place
    }

    public init(from decoder: Decoder) throws {
        place = try decoder.container(keyedBy: CodingKeys.self).decode(WorkerPlaceTarget?.self, forKey: .place)
    }
}

public enum ProjectProcedures {
    public static let list = HausProcedure<ServerScopeInput, [Project]>.query("project.list")
    public static let create = HausProcedure<ProjectCreateInput, ProjectMutationResult>.mutation("project.create")
    public static let update = HausProcedure<ProjectUpdateInput, ProjectMutationResult>.mutation("project.update")
    public static let addRepo = HausProcedure<ProjectRepoInput, ProjectRepoAdded>.mutation("project.addRepo")
    public static let removeRepo = HausProcedure<ProjectRepoTarget, ProjectRepoRemoved>.mutation("project.removeRepo")
    public static let linkRepo = HausProcedure<ProjectRepoLinkInput, ProjectRepoLinkReceipt>.mutation("project.linkRepo")
    public static let unlinkRepo = HausProcedure<ProjectRepoUnlinkInput, ProjectRepoLinkReceipt>
        .mutation("project.unlinkRepo")
    public static let setDefaultWorkerPlace = HausProcedure<ProjectDefaultWorkerPlaceInput, ProjectDefaultWorkerPlace>
        .mutation("project.setDefaultWorkerPlace")
}

public struct ProjectUpdatedEvent: Decodable, Sendable, Equatable {
    public let projectID: String
    public let serverID: String

    enum CodingKeys: String, CodingKey {
        case projectID = "projectId"
        case serverID = "serverId"
    }
}
