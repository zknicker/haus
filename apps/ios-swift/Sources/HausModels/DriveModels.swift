import Foundation

extension SharedArtifactCreator: Encodable {
    enum WireKeys: String, CodingKey {
        case type
        case agentID = "agent_id"
        case userID = "user_id"
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: WireKeys.self)
        switch self {
        case let .agent(id):
            try container.encode("agent", forKey: .type)
            try container.encode(id, forKey: .agentID)
        case let .user(id):
            try container.encode("user", forKey: .type)
            try container.encode(id, forKey: .userID)
        }
    }
}

public enum ArtifactAuthor: Decodable, Hashable, Sendable {
    case agent(id: String)
    case user(id: String)
    case worker(id: String, agentID: String)
    case haus

    enum CodingKeys: String, CodingKey {
        case type
        case agentID = "agent_id"
        case userID = "user_id"
        case workerID = "worker_id"
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        switch try container.decode(String.self, forKey: .type) {
        case "agent": self = .agent(id: try container.decode(String.self, forKey: .agentID))
        case "user": self = .user(id: try container.decode(String.self, forKey: .userID))
        case "worker":
            self = .worker(
                id: try container.decode(String.self, forKey: .workerID),
                agentID: try container.decode(String.self, forKey: .agentID)
            )
        case "haus": self = .haus
        case let other:
            throw DecodingError.dataCorruptedError(
                forKey: .type, in: container, debugDescription: "Unknown artifact author type \(other)."
            )
        }
    }
}

public struct ArtifactImageFacts: Decodable, Hashable, Sendable {
    public let dpi: Int?
    public let height: Int
    public let width: Int

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        dpi = try container.decode(Int?.self, forKey: .dpi)
        height = try container.decode(Int.self, forKey: .height)
        width = try container.decode(Int.self, forKey: .width)
    }

    enum CodingKeys: String, CodingKey {
        case dpi, height, width
    }
}

public struct ArtifactRecord: Decodable, Identifiable, Hashable, Sendable {
    public let metadata: SharedArtifactMetadata
    public let sha256: String
    public let versionURL: String
    public let author: ArtifactAuthor
    public let baseRevisionID: String?
    public let image: ArtifactImageFacts?
    public let parentRevisionID: String?
    public let taskID: String?

    public var id: String { metadata.artifactID }

    enum CodingKeys: String, CodingKey {
        case sha256, author, image
        case versionURL = "version_url"
        case baseRevisionID = "base_revision_id"
        case parentRevisionID = "parent_revision_id"
        case taskID = "task_id"
    }

    public init(from decoder: Decoder) throws {
        metadata = try SharedArtifactMetadata(from: decoder)
        let container = try decoder.container(keyedBy: CodingKeys.self)
        sha256 = try container.decode(String.self, forKey: .sha256)
        guard sha256.wholeMatch(of: /[a-f0-9]{64}/) != nil else {
            throw DecodingError.dataCorruptedError(forKey: .sha256, in: container, debugDescription: "Invalid sha256.")
        }
        versionURL = try container.decode(String.self, forKey: .versionURL)
        author = try container.decode(ArtifactAuthor.self, forKey: .author)
        baseRevisionID = try container.decode(String?.self, forKey: .baseRevisionID)
        image = try container.decode(ArtifactImageFacts?.self, forKey: .image)
        parentRevisionID = try container.decode(String?.self, forKey: .parentRevisionID)
        taskID = try container.decode(String?.self, forKey: .taskID)
    }
}

public struct ArtifactRecordResult: Decodable, Sendable {
    public let artifact: ArtifactRecord
}

public struct ArtifactFolderEntry: Decodable, Hashable, Sendable {
    public let fileCount: Int
    public let name: String
    public let path: String
    public let updatedAt: Date

    enum CodingKeys: String, CodingKey {
        case name, path
        case fileCount = "file_count"
        case updatedAt = "updated_at"
    }
}

public struct ArtifactListSummary: Decodable, Hashable, Sendable {
    public let folders: Int
    public let filesInFolders: Int
    public let files: Int

    enum CodingKeys: String, CodingKey {
        case folders, files
        case filesInFolders = "files_in_folders"
    }
}

public struct ArtifactPublicLink: Decodable, Hashable, Sendable {
    public let createdAt: Date
    public let creator: SharedArtifactCreator
    public let canDisable: Bool
    public let url: URL

    enum CodingKeys: String, CodingKey {
        case creator, url
        case createdAt = "created_at"
        case canDisable = "can_disable"
    }
}

public struct ArtifactLibraryPage: Decodable, Sendable {
    public let artifacts: [ArtifactRecord]
    public let folders: [ArtifactFolderEntry]
    public let nextOffset: Int?
    public let summary: ArtifactListSummary
    public let publicLinks: [String: ArtifactPublicLink]

    enum CodingKeys: String, CodingKey {
        case artifacts, folders, summary
        case nextOffset = "next_offset"
        case publicLinks = "public_links"
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        artifacts = try container.decode([ArtifactRecord].self, forKey: .artifacts)
        folders = try container.decode([ArtifactFolderEntry].self, forKey: .folders)
        nextOffset = try container.decode(Int?.self, forKey: .nextOffset)
        summary = try container.decode(ArtifactListSummary.self, forKey: .summary)
        publicLinks = try container.decode([String: ArtifactPublicLink].self, forKey: .publicLinks)
    }
}

public enum ArtifactTextResult: Decodable, Equatable, Sendable {
    case text(String)
    case tooLarge(limitBytes: Int)
    case binary

    enum CodingKeys: String, CodingKey {
        case status, text
        case limitBytes = "limit_bytes"
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        switch try container.decode(String.self, forKey: .status) {
        case "text": self = .text(try container.decode(String.self, forKey: .text))
        case "too_large": self = .tooLarge(limitBytes: try container.decode(Int.self, forKey: .limitBytes))
        case "binary": self = .binary
        case let status:
            throw DecodingError.dataCorruptedError(
                forKey: .status, in: container, debugDescription: "Unknown artifact text status \(status)."
            )
        }
    }
}

public struct ArtifactUpdatedEvent: Decodable, Sendable, Equatable {
    public let artifactID: String?
    public let serverID: String

    enum CodingKeys: String, CodingKey {
        case artifactID = "artifactId"
        case serverID = "serverId"
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        artifactID = try container.decode(String?.self, forKey: .artifactID)
        serverID = try container.decode(String.self, forKey: .serverID)
    }
}
