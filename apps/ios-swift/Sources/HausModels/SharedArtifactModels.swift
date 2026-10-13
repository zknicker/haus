import Foundation

/// Who created a shared artifact (its first revision): exactly one Agent or one
/// Server member, `artifactCreatorSchema` in `packages/haus-api/src/artifacts.ts`.
public enum SharedArtifactCreator: Hashable, Sendable, Decodable {
    case agent(id: String)
    case user(id: String)

    private enum CodingKeys: String, CodingKey {
        case type
        case agentID = "agent_id"
        case userID = "user_id"
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        switch try container.decode(String.self, forKey: .type) {
        case "agent": self = .agent(id: try container.decode(String.self, forKey: .agentID))
        case "user": self = .user(id: try container.decode(String.self, forKey: .userID))
        case let other:
            throw DecodingError.dataCorruptedError(
                forKey: .type, in: container, debugDescription: "Unknown artifact creator type \(other)."
            )
        }
    }
}

/// The fields of `artifactMetadataSchema` the phone reads. `createdAt` is the
/// artifact identity's first publication; `updatedAt` is when the described
/// revision was published.
public struct SharedArtifactMetadata: Hashable, Sendable, Decodable {
    public let artifactID: String
    public let contentType: String
    public let createdAt: Date
    public let creator: SharedArtifactCreator
    public let filename: String
    public let path: String
    public let revisionID: String
    public let revisionNumber: Int
    public let sizeBytes: Int
    public let stableURL: String
    public let title: String
    public let updatedAt: Date

    private enum CodingKeys: String, CodingKey {
        case artifactID = "artifact_id"
        case contentType = "content_type"
        case createdAt = "created_at"
        case creator
        case filename
        case path
        case revisionID = "revision_id"
        case revisionNumber = "revision_number"
        case sizeBytes = "size_bytes"
        case stableURL = "stable_url"
        case title
        case updatedAt = "updated_at"
    }

    public init(
        artifactID: String, contentType: String, createdAt: Date, creator: SharedArtifactCreator,
        filename: String, path: String, revisionID: String, revisionNumber: Int, sizeBytes: Int,
        stableURL: String, title: String, updatedAt: Date
    ) {
        self.artifactID = artifactID
        self.contentType = contentType
        self.createdAt = createdAt
        self.creator = creator
        self.filename = filename
        self.path = path
        self.revisionID = revisionID
        self.revisionNumber = revisionNumber
        self.sizeBytes = sizeBytes
        self.stableURL = stableURL
        self.title = title
        self.updatedAt = updatedAt
    }

    public var fileKind: SharedArtifactFileKind {
        SharedArtifactFileKind(contentType: contentType, filename: filename)
    }
}

/// `artifact.get`'s result, `artifactPublishResultSchema`.
public struct SharedArtifactResult: Decodable, Sendable {
    public let artifact: SharedArtifactMetadata
}

/// `artifact.download`'s result: a signed link that expires five minutes after
/// it is issued.
public struct SharedArtifactDownload: Decodable, Sendable {
    public let artifact: SharedArtifactMetadata
    public let downloadURL: URL
    public let expiresAt: Date

    private enum CodingKeys: String, CodingKey {
        case artifact
        case downloadURL = "download_url"
        case expiresAt = "expires_at"
    }
}

/// `artifactTargetInputSchema`, and with `save` `artifactDownloadInputSchema`.
public struct SharedArtifactTargetInput: Encodable, Sendable {
    public let artifactID: String
    public let revisionID: String?
    public let serverID: String
    public let save: Bool?

    public init(target: SharedArtifactLinkTarget, serverID: String, save: Bool? = nil) {
        artifactID = target.artifactID
        revisionID = target.revisionID
        self.serverID = serverID
        self.save = save
    }

    private enum CodingKeys: String, CodingKey {
        case artifactID = "artifact_id"
        case revisionID = "revision_id"
        case serverID = "serverId"
        case save
    }
}

/// How the phone previews a file, read from its content type and, when the
/// type is generic, its extension.
public enum SharedArtifactFileKind: Hashable, Sendable {
    case image
    case video
    case audio
    case html
    case pdf
    /// Text, Markdown, CSV, code, office documents, and everything else Quick
    /// Look can try.
    case document

    public init(contentType rawContentType: String, filename: String) {
        let contentType = rawContentType.split(separator: ";").first
            .map { $0.trimmingCharacters(in: .whitespaces).lowercased() } ?? ""
        let fileExtension = (filename as NSString).pathExtension.lowercased()
        if contentType == "image/svg+xml" || fileExtension == "svg" {
            // An SVG is a document, not a raster: Quick Look draws it safely.
            self = .document
        } else if contentType.hasPrefix("image/") || Self.imageExtensions.contains(fileExtension) {
            self = .image
        } else if contentType.hasPrefix("video/") || Self.videoExtensions.contains(fileExtension) {
            self = .video
        } else if contentType.hasPrefix("audio/") || Self.audioExtensions.contains(fileExtension) {
            self = .audio
        } else if contentType == "text/html" || fileExtension == "html" || fileExtension == "htm" {
            self = .html
        } else if contentType == "application/pdf" || fileExtension == "pdf" {
            self = .pdf
        } else {
            self = .document
        }
    }

    private static let imageExtensions: Set<String> = ["png", "jpg", "jpeg", "gif", "webp", "heic", "heif"]
    private static let videoExtensions: Set<String> = ["mp4", "mov", "m4v"]
    private static let audioExtensions: Set<String> = ["mp3", "m4a", "wav", "aac"]
}
