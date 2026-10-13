import Foundation
import HausModels

/// Why a shared artifact could not be opened, in the words its viewer says.
public enum SharedArtifactUnavailable: Error, Equatable, Sendable {
    /// Deleted, or the link names an artifact this Server never had.
    case missing
    /// The viewer may not read this Server's library.
    case forbidden
    /// This phone could not reach the Server.
    case offline
    /// The Server has no file storage configured, so only metadata reads work.
    case storageUnavailable
    /// Anything else: the read failed for a reason the phone cannot name.
    case failed

    public var title: String {
        switch self {
        case .missing: "Artifact not found"
        case .forbidden: "Artifact not shared with you"
        case .offline: "You’re offline"
        case .storageUnavailable: "File unavailable"
        case .failed: "Artifact unavailable"
        }
    }

    public var message: String {
        switch self {
        case .missing:
            "This artifact was deleted, or the link points somewhere it never existed."
        case .forbidden:
            "You don’t have access to this Server’s shared files."
        case .offline:
            "Haus can’t reach the Server from this phone right now. Try again once you’re back online."
        case .storageUnavailable:
            "This Server can’t hand out its shared files right now."
        case .failed:
            "Haus couldn’t load this artifact. Try again in a moment."
        }
    }

    /// Whether trying again could help.
    public var isRetryable: Bool { self != .missing && self != .forbidden }
}

/// Reads a shared artifact and its bytes for the viewer.
///
/// Artifact chips are drawn in transcript cells, which inherit no custom
/// environment, so the App installs the reads here once at its root — the
/// seam `ArtifactPageReader` and `InAppReferenceRoutes` use. Nothing installed
/// (previews, tests) reads as a failure.
@MainActor
public enum SharedArtifactReader {
    /// `artifact.get` for the link's artifact, pinned when the link is.
    public static var get: ((SharedArtifactLinkTarget) async throws -> SharedArtifactMetadata)?
    /// The described revision's bytes as a local file the App owns.
    public static var file: ((SharedArtifactMetadata) async throws -> URL)?
    /// The creator's current display name, or nil when the App cannot name them.
    public static var creatorName: ((SharedArtifactCreator) -> String?)?

    static func loadMetadata(_ target: SharedArtifactLinkTarget) async -> Result<SharedArtifactMetadata, SharedArtifactUnavailable> {
        guard let get else { return .failure(.failed) }
        return await result { try await get(target) }
    }

    static func loadFile(_ artifact: SharedArtifactMetadata) async -> Result<URL, SharedArtifactUnavailable> {
        guard let file else { return .failure(.failed) }
        return await result { try await file(artifact) }
    }

    private static func result<Value>(_ read: () async throws -> Value) async -> Result<Value, SharedArtifactUnavailable> {
        do {
            return .success(try await read())
        } catch let unavailable as SharedArtifactUnavailable {
            return .failure(unavailable)
        } catch {
            return .failure(.failed)
        }
    }
}

extension SharedArtifactFileKind {
    /// The mark a chip and the viewer's header draw for this kind of file.
    public var glyph: HausIconName {
        switch self {
        case .image: .image
        case .video: .video
        case .audio: .voice
        case .pdf: .pdf
        case .html, .document: .document
        }
    }
}
