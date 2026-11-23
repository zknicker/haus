import Foundation
import HausModels
import HausTransport
import Observation

/// A Drive listing, without the Server it runs against.
public struct DriveQuery: Hashable, Sendable {
    public let prefix: String
    public let query: String
    public let kind: ArtifactListKind

    public init(prefix: String = "", query: String = "", kind: ArtifactListKind = .all) {
        self.prefix = prefix
        self.query = query
        self.kind = kind
    }

    public func input(serverID: String) -> ArtifactListInput? {
        ArtifactListInput(serverID: serverID, kind: kind, prefix: prefix, query: query)
    }
}

/// One shown Drive page and the query it answers.
public struct DriveListing: Sendable {
    public let query: DriveQuery
    public let page: ArtifactLibraryPage
}

public enum DriveQueryError: LocalizedError, Equatable {
    case tooLong

    public var errorDescription: String? {
        "Search Drive with \(ArtifactListInput.queryMaxCharacters) characters or fewer."
    }
}

/// The Server's Drive: the artifacts its Captains and people shared, one
/// listing at a time.
@MainActor
@Observable
public final class DriveModel {
    public internal(set) var listing: DriveListing?
    /// A place's newest files under its folder, for its Work view.
    public internal(set) var recentByFolder: [String: [ArtifactRecord]] = [:]
    /// `artifact.byPath`, per path a file preview has opened.
    public internal(set) var fileByPath: [String: ArtifactRecord] = [:]

    @ObservationIgnored let client: TRPCClient
    @ObservationIgnored let scope: ServerScope
    @ObservationIgnored var reads = ReadSequence<WholeList>()
    @ObservationIgnored var recentReads = ReadSequence<String>()
    @ObservationIgnored var fileReads = ReadSequence<String>()

    public init(client: TRPCClient, scope: ServerScope) {
        self.client = client
        self.scope = scope
    }

    public func reset() {
        listing = nil
        recentByFolder = [:]
        fileByPath = [:]
        reads.reset()
        recentReads.reset()
        fileReads.reset()
    }

    public func show(_ query: DriveQuery) async throws {
        let read = try beginRead()
        guard let input = query.input(serverID: read.serverID) else { throw DriveQueryError.tooLong }
        let page = try await client.call(DriveProcedures.list, input)
        land(page, for: read, query: query)
    }

    public func beginRead() throws -> ScopedRead<WholeList> {
        try reads.begin(.all, in: scope)
    }

    @discardableResult
    public func land(_ page: ArtifactLibraryPage, for read: ScopedRead<WholeList>, query: DriveQuery) -> Bool {
        guard scope.accepts(read, in: reads) else { return false }
        listing = DriveListing(query: query, page: page)
        return true
    }
}
