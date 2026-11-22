import Foundation
import HausModels
import HausTransport

/// The Drive reads a place's Work view and a file preview make.
extension DriveModel {
    public static let recentFileLimit = 5

    /// The newest files anywhere under `folder`, newest first.
    public func loadRecent(folder: String) async throws {
        let read = try recentReads.begin(folder, in: scope)
        guard let input = ArtifactListInput(
            serverID: read.serverID,
            limit: Self.recentFileLimit,
            order: .updated,
            direction: .desc,
            prefix: folder,
            recursive: true
        ) else { throw DriveQueryError.tooLong }
        let page = try await client.call(DriveProcedures.list, input)
        landRecent(page.artifacts, for: read)
    }

    @discardableResult
    public func landRecent(_ files: [ArtifactRecord], for read: ScopedRead<String>) -> Bool {
        guard scope.accepts(read, in: recentReads) else { return false }
        if recentByFolder[read.key] != files { recentByFolder[read.key] = files }
        return true
    }

    /// The file at `path`, at its newest revision.
    public func loadFile(path: String) async throws {
        let read = try fileReads.begin(path, in: scope)
        guard let input = ArtifactByPathInput(path: path, serverID: read.serverID) else { throw DriveFileError.noPath }
        let record = try await client.call(DriveProcedures.byPath, input).artifact
        landFile(record, for: read)
    }

    @discardableResult
    public func landFile(_ record: ArtifactRecord, for read: ScopedRead<String>) -> Bool {
        guard scope.accepts(read, in: fileReads) else { return false }
        if fileByPath[read.key] != record { fileByPath[read.key] = record }
        return true
    }

    /// `artifact.text` for one revision.
    public func text(_ record: ArtifactRecord) async throws -> ArtifactTextResult {
        let ticket = try scope.requireTicket()
        let input = ArtifactTextInput(
            artifactID: record.metadata.artifactID,
            revisionID: record.metadata.revisionID,
            serverID: ticket.serverID
        )
        return try await client.call(DriveProcedures.text, input)
    }
}

public enum DriveFileError: LocalizedError, Equatable {
    case noPath

    public var errorDescription: String? { "This file has no path." }
}
