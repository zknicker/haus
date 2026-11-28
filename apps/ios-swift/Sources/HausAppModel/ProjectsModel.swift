import Foundation
import HausModels
import HausTransport
import Observation
import OSLog

/// The Server's Projects (`project.list`): keys, home Captains, the default
/// Machine, and whether each is archived. The Chat list stays the
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

    /// Renames a Project or changes its key. A key is editable only until the
    /// Project has an Issue, since Issue codes carry it.
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

    /// The Machine a Task started here runs on unless its starter picks one.
    /// Nil asks each time.
    public func setDefaultMachine(projectID: String, computerID: String?) async throws {
        let ticket = try scope.requireTicket()
        _ = try await client.call(
            ProjectProcedures.setDefaultMachine,
            ProjectSetDefaultMachineInput(computerID: computerID, projectID: projectID, serverID: ticket.serverID)
        )
        try await reload()
    }

    static let logger = Logger(subsystem: "chat.haus.ios", category: "projects")
}

public enum ProjectEditError: LocalizedError, Equatable {
    case invalidName
    case invalidKey

    public var errorDescription: String? {
        switch self {
        case .invalidName: "A Project name is up to 32 letters, numbers, dashes, or underscores."
        case .invalidKey: "A key is 2 to 5 capital letters or numbers, starting with a letter."
        }
    }
}
