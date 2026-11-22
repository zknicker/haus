import HausModels

/// Which Server is active, decided from the Server list and the persisted
/// choice, never from list order alone (specs/ios-app.md, Server lifecycle).
public enum ServerSelection {
    /// The persisted Server while the viewer still belongs to it, else the
    /// first Server listed.
    public static func activeServerID(in servers: [ServerSummary], preferred: String?) -> String? {
        if let preferred, servers.contains(where: { $0.id == preferred }) { return preferred }
        return servers.first?.id
    }

    /// What a fresh `server.list` means for the active Server.
    public static func change(
        activeServerID: String,
        current: [ServerSummary],
        loaded: [ServerSummary]
    ) -> ServerListChange {
        guard loaded.contains(where: { $0.id == activeServerID }) else { return .membershipLost }
        return current == loaded ? .unchanged : .updated(loaded)
    }
}

public enum ServerListChange: Equatable, Sendable {
    case unchanged
    case updated([ServerSummary])
    /// The viewer no longer belongs to the active Server.
    case membershipLost
}
