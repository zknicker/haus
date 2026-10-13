import Foundation
import HausModels
import HausTransport
import HausUI

/// Shared-library artifact links: which links are library links (the open
/// Server's scope), the titles their chips wear, and the reads the artifact
/// viewer makes — `artifact.get`, then `artifact.download`'s signed link.
extension HausStore {
    /// Parse scope follows the open Server. A move retires every parsed body,
    /// since a link that was a library link may no longer be one.
    func syncSharedArtifactScope() {
        let scope = activeServer.map {
            SharedArtifactLinkScope(origins: HausRuntimeConfiguration.appOrigins, slug: $0.slug)
        }
        guard projections.sharedArtifacts.scope != scope else { return }
        projections.sharedArtifacts.scope = scope
        projections.retireReferenceChips()
    }

    /// A library chip's presentation once its metadata has landed. Until then
    /// the parser's own chip stands (the link's words, or `Artifact`), and a
    /// first sight starts the read. A failed read keeps the fallback: the chip
    /// never invents a title, and nothing retries in a loop while offline.
    func sharedArtifactReference(key: String) -> RichReferencePresentation? {
        guard let target = SharedArtifactLinkTarget(key: key) else { return nil }
        switch projections.sharedArtifacts.loads[key] {
        case .loaded(let artifact):
            return RichReferencePresentation(
                id: key,
                kind: .sharedArtifact,
                label: artifact.title,
                avatarURL: nil,
                fileGlyph: artifact.fileKind.glyph
            )
        case .loading, .unavailable:
            return nil
        case nil:
            projections.sharedArtifacts.loads[key] = .loading
            Task { await loadSharedArtifactChip(target) }
            return nil
        }
    }

    func installSharedArtifactReader() {
        SharedArtifactReader.get = { [weak self] target in
            guard let self else { throw SharedArtifactUnavailable.failed }
            return try await self.sharedArtifact(target)
        }
        SharedArtifactReader.file = { [weak self] artifact in
            guard let self else { throw SharedArtifactUnavailable.failed }
            return try await self.sharedArtifactFile(artifact)
        }
        SharedArtifactReader.creatorName = { [weak self] creator in
            self?.sharedArtifactCreatorName(creator)
        }
    }

    private func loadSharedArtifactChip(_ target: SharedArtifactLinkTarget) async {
        do {
            let artifact = try await sharedArtifact(target)
            projections.sharedArtifacts.loads[target.key] = .loaded(artifact)
            projections.retireReferenceChips()
            sharedArtifactRevision += 1
        } catch {
            projections.sharedArtifacts.loads[target.key] = .unavailable
        }
    }

    private func sharedArtifact(_ target: SharedArtifactLinkTarget) async throws -> SharedArtifactMetadata {
        guard let serverID = activeServer?.id else { throw SharedArtifactUnavailable.failed }
        let result: SharedArtifactResult = try await artifactRead {
            try await client.query("artifact.get", input: SharedArtifactTargetInput(target: target, serverID: serverID))
        }
        return result.artifact
    }

    /// The revision's bytes in a temporary file named for the artifact.
    /// Revisions are immutable, so a file already downloaded at the right
    /// size is reused. A signed link lives five minutes; one refused by
    /// storage (expired, or issued just before it lapsed) is asked for again
    /// once before the viewer says the file is unavailable.
    private func sharedArtifactFile(_ artifact: SharedArtifactMetadata) async throws -> URL {
        let destination = Self.sharedArtifactFileURL(artifact)
        if let size = try? destination.resourceValues(forKeys: [.fileSizeKey]).fileSize, size == artifact.sizeBytes {
            return destination
        }
        guard let serverID = activeServer?.id else { throw SharedArtifactUnavailable.failed }
        let pinned = SharedArtifactLinkTarget(artifactID: artifact.artifactID, revisionID: artifact.revisionID)
        for attempt in 0..<2 {
            let link: SharedArtifactDownload = try await artifactRead {
                try await client.query(
                    "artifact.download",
                    input: SharedArtifactTargetInput(target: pinned, serverID: serverID, save: false)
                )
            }
            let (temporary, response) = try await downloadTransfer(link.downloadURL)
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            if (200..<300).contains(status) {
                try Self.place(temporary, at: destination)
                return destination
            }
            try? FileManager.default.removeItem(at: temporary)
            Self.logger.error("Shared artifact download refused with HTTP \(status, privacy: .public) on attempt \(attempt, privacy: .public)")
            guard status == 400 || status == 403 else { break }
        }
        throw SharedArtifactUnavailable.failed
    }

    private func sharedArtifactCreatorName(_ creator: SharedArtifactCreator) -> String? {
        switch creator {
        case .agent(let id):
            return agentsByID[id]?.displayName
        case .user(let id):
            let member = membersByID[id]
            return member?.displayName ?? member?.handle
        }
    }

    /// Maps a Server read's failure onto what the viewer says.
    private func artifactRead<Value>(_ read: () async throws -> Value) async throws -> Value {
        do {
            return try await read()
        } catch let error as TRPCError {
            switch error.domainCode {
            case "NOT_FOUND": throw SharedArtifactUnavailable.missing
            case "FORBIDDEN": throw SharedArtifactUnavailable.forbidden
            case "SERVICE_UNAVAILABLE": throw SharedArtifactUnavailable.storageUnavailable
            default: throw SharedArtifactUnavailable.failed
            }
        } catch let error as TRPCClientError where error.isNoConnection || (!isConnected && error.isTransport) {
            throw SharedArtifactUnavailable.offline
        } catch is CancellationError {
            throw CancellationError()
        } catch {
            Self.logger.error("Reading a shared artifact failed: \(error.localizedDescription, privacy: .public)")
            throw SharedArtifactUnavailable.failed
        }
    }

    private func downloadTransfer(_ url: URL) async throws -> (URL, URLResponse) {
        do {
            return try await URLSession.shared.download(from: url)
        } catch let error as URLError where Self.offlineCodes.contains(error.code) {
            throw SharedArtifactUnavailable.offline
        } catch is CancellationError {
            throw CancellationError()
        } catch {
            Self.logger.error("Downloading a shared artifact failed: \(error.localizedDescription, privacy: .public)")
            throw SharedArtifactUnavailable.failed
        }
    }

    private static func sharedArtifactFileURL(_ artifact: SharedArtifactMetadata) -> URL {
        let name = (artifact.filename as NSString).lastPathComponent
        return FileManager.default.temporaryDirectory
            .appendingPathComponent("shared-artifacts", isDirectory: true)
            .appendingPathComponent(artifact.revisionID, isDirectory: true)
            .appendingPathComponent(name.isEmpty ? artifact.artifactID : name, isDirectory: false)
    }

    private static func place(_ temporary: URL, at destination: URL) throws {
        let files = FileManager.default
        try files.createDirectory(at: destination.deletingLastPathComponent(), withIntermediateDirectories: true)
        try? files.removeItem(at: destination)
        try files.moveItem(at: temporary, to: destination)
    }

    private static let offlineCodes: Set<URLError.Code> = [
        .notConnectedToInternet, .networkConnectionLost, .cannotFindHost, .cannotConnectToHost, .dnsLookupFailed,
    ]
}

/// The library scope message bodies parse under, and each chip's metadata read.
struct SharedArtifactChips {
    enum Load {
        case loading
        case loaded(SharedArtifactMetadata)
        case unavailable
    }

    var scope: SharedArtifactLinkScope?
    var loads: [String: Load] = [:]
}
