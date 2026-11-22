import Foundation

public enum ArtifactListKind: String, Encodable, CaseIterable, Sendable {
    case all, images, documents, media, other
}

public enum ArtifactListOrder: String, Encodable, CaseIterable, Sendable {
    case updated, path, name, size, kind
}

public enum ArtifactListDirection: String, Encodable, Sendable {
    case asc, desc
}

public struct ArtifactListInput: Encodable, Equatable, Sendable {
    public static let limitRange = 1...200
    public static let offsetRange = 0...100_000
    public static let queryMaxCharacters = 200

    public let serverID: String
    public let creator: SharedArtifactCreator?
    public let kind: ArtifactListKind
    public let limit: Int
    public let offset: Int
    public let order: ArtifactListOrder
    public let direction: ArtifactListDirection?
    public let prefix: String
    public let query: String
    public let recursive: Bool

    public init?(
        serverID: String,
        creator: SharedArtifactCreator? = nil,
        kind: ArtifactListKind = .all,
        limit: Int = 50,
        offset: Int = 0,
        order: ArtifactListOrder = .updated,
        direction: ArtifactListDirection? = nil,
        prefix: String = "",
        query: String = "",
        recursive: Bool = false
    ) {
        guard Self.limitRange.contains(limit), Self.offsetRange.contains(offset),
              query.trimmingCharacters(in: .whitespacesAndNewlines).utf16.count <= Self.queryMaxCharacters
        else { return nil }
        self.serverID = serverID
        self.creator = creator
        self.kind = kind
        self.limit = limit
        self.offset = offset
        self.order = order
        self.direction = direction
        self.prefix = prefix
        self.query = query
        self.recursive = recursive
    }

    enum CodingKeys: String, CodingKey {
        case creator, kind, limit, offset, order, direction, prefix, query, recursive
        case serverID = "serverId"
    }
}

public struct ArtifactByPathInput: Encodable, Equatable, Sendable {
    public let path: String
    public let revisionID: String?
    public let serverID: String

    public init?(path: String, revisionID: String? = nil, serverID: String) {
        guard !path.isEmpty else { return nil }
        self.path = path
        self.revisionID = revisionID
        self.serverID = serverID
    }

    enum CodingKeys: String, CodingKey {
        case path
        case revisionID = "revision_id"
        case serverID = "serverId"
    }
}

public struct ArtifactTextInput: Encodable, Equatable, Sendable {
    public let artifactID: String
    public let revisionID: String
    public let serverID: String

    public init(artifactID: String, revisionID: String, serverID: String) {
        self.artifactID = artifactID
        self.revisionID = revisionID
        self.serverID = serverID
    }

    enum CodingKeys: String, CodingKey {
        case artifactID = "artifact_id"
        case revisionID = "revision_id"
        case serverID = "serverId"
    }
}

public enum DriveProcedures {
    public static let list = HausProcedure<ArtifactListInput, ArtifactLibraryPage>.query("artifact.list")
    public static let byPath = HausProcedure<ArtifactByPathInput, ArtifactRecordResult>.query("artifact.byPath")
    public static let text = HausProcedure<ArtifactTextInput, ArtifactTextResult>.query("artifact.text")
    public static let download = HausProcedure<SharedArtifactTargetInput, SharedArtifactDownload>
        .query("artifact.download")
}
