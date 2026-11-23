import Foundation
import HausModels
import HausTransport
import Observation
import OSLog

/// The Server's Projects (`project.list`): keys, home Captains, repos, the
/// default Worker place, and whether each is archived. The Chat list stays the
/// source of which Projects the viewer has joined; this model adds what only
/// a Project carries. Every write re-reads the list it changed.
@MainActor
@Observable
public final class ProjectsModel {
    /// Every Project on the Server, archived ones included. Nil until the
    /// first read lands.
    public internal(set) var projects: [Project]?

    @ObservationIgnored let client: TRPCClient
    @ObservationIgnored let scope: ServerScope
    @ObservationIgnored var reads = ReadSequence<WholeList>()

    public init(client: TRPCClient, scope: ServerScope) {
        self.client = client
        self.scope = scope
    }

    public func reset() {
        projects = nil
        reads.reset()
    }

    public func project(chatID: String) -> Project? {
        projects?.first { $0.chatID == chatID }
    }

    public func project(id: String) -> Project? {
        projects?.first { $0.id == id }
    }

    /// How many Projects are archived, once the list has landed.
    public var archivedCount: Int? {
        projects.map { $0.count(where: \.archived) }
    }

    // MARK: - Reads

    /// Refreshes the list, keeping what is held when the read fails.
    public func load() async {
        do {
            try await reload()
        } catch ServerScopeError.serverUnavailable {
            return
        } catch {
            Self.logger.error("Loading Projects failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    /// `project.onUpdated` and its stream starts: re-reads the list once one
    /// has landed.
    public func recover(_ projections: Set<RealtimeProjection>) async {
        guard Self.recovers(projections, holding: projects) else { return }
        await load()
    }

    nonisolated static func recovers(_ projections: Set<RealtimeProjection>, holding projects: [Project]?) -> Bool {
        projections.contains(.projects) && projects != nil
    }

    public func reload() async throws {
        let read = try beginRead()
        let loaded = try await client.call(ProjectProcedures.list, ServerScopeInput(serverID: read.serverID))
        landProjects(loaded, for: read)
    }

    public func beginRead() throws -> ScopedRead<WholeList> {
        try reads.begin(.all, in: scope)
    }

    @discardableResult
    public func landProjects(_ loaded: [Project], for read: ScopedRead<WholeList>) -> Bool {
        guard scope.accepts(read, in: reads) else { return false }
        if projects != loaded { projects = loaded }
        return true
    }

    // MARK: - Writes

    /// Renames a Project or changes its Task key. A key is editable only
    /// until the Project has a Task.
    public func update(chatID: String, name: String?, key: String?) async throws {
        let ticket = try scope.requireTicket()
        let projectKey = try key.map { raw in
            guard let parsed = ProjectKey(raw) else { throw ProjectEditError.invalidKey }
            return parsed
        }
        guard let input = ProjectUpdateInput(chatID: chatID, serverID: ticket.serverID, name: name, key: projectKey) else {
            throw ProjectEditError.invalidName
        }
        _ = try await client.call(ProjectProcedures.update, input)
        try await reload()
    }

    public func addRepo(projectID: String, repository: String) async throws {
        let ticket = try scope.requireTicket()
        guard let input = ProjectRepoInput(projectID: projectID, repository: repository, serverID: ticket.serverID) else {
            throw ProjectEditError.invalidRepository
        }
        _ = try await client.call(ProjectProcedures.addRepo, input)
        try await reload()
    }

    public func removeRepo(projectRepoID: String) async throws {
        let ticket = try scope.requireTicket()
        _ = try await client.call(
            ProjectProcedures.removeRepo,
            ProjectRepoTarget(projectRepoID: projectRepoID, serverID: ticket.serverID)
        )
        try await reload()
    }

    public func linkRepo(projectRepoID: String, computerID: String, checkoutPath: String?) async throws {
        let ticket = try scope.requireTicket()
        let path = checkoutPath?.trimmingCharacters(in: .whitespacesAndNewlines)
        _ = try await client.call(
            ProjectProcedures.linkRepo,
            ProjectRepoLinkInput(
                checkoutPath: path?.isEmpty == false ? path : nil,
                computerID: computerID,
                projectRepoID: projectRepoID,
                serverID: ticket.serverID
            )
        )
        try await reload()
    }

    public func unlinkRepo(projectRepoID: String, computerID: String) async throws {
        let ticket = try scope.requireTicket()
        _ = try await client.call(
            ProjectProcedures.unlinkRepo,
            ProjectRepoUnlinkInput(computerID: computerID, projectRepoID: projectRepoID, serverID: ticket.serverID)
        )
        try await reload()
    }

    /// Where a Project's Workers run unless someone picks a place. Nil asks
    /// each time.
    public func setDefaultWorkerPlace(projectID: String, place: WorkerPlaceTarget?) async throws {
        let ticket = try scope.requireTicket()
        _ = try await client.call(
            ProjectProcedures.setDefaultWorkerPlace,
            ProjectDefaultWorkerPlaceInput(place: place, projectID: projectID, serverID: ticket.serverID)
        )
        try await reload()
    }

    static let logger = Logger(subsystem: "chat.haus.ios", category: "projects")
}

public enum ProjectEditError: LocalizedError, Equatable {
    case invalidName
    case invalidKey
    case invalidRepository

    public var errorDescription: String? {
        switch self {
        case .invalidName: "A Project name is up to 32 letters, numbers, dashes, or underscores."
        case .invalidKey: "A key is 2 to 5 capital letters or numbers, starting with a letter."
        case .invalidRepository: "Enter a GitHub repository as owner/name."
        }
    }
}
