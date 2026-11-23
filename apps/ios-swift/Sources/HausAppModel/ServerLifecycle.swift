import Foundation
import HausModels

/// The Server lifecycle of specs/ios-app.md: which Server is active, what a
/// cold launch paints, and what a switch, a membership loss, or a sign-out
/// clears. It owns everything this device keeps per Server: the persisted
/// choice, the launch snapshots, and the composer drafts.
@MainActor
public final class ServerLifecycle<Staged: AnyObject> {
    public let userID: String
    public let scope: ServerScope
    public let preference: ActiveServerPreference
    public let launchSnapshots: LaunchSnapshotStore
    public let drafts: ComposerDraftStore<Staged>

    public init(
        userID: String,
        scope: ServerScope,
        preference: ActiveServerPreference,
        launchSnapshots: LaunchSnapshotStore,
        drafts: ComposerDraftStore<Staged>
    ) {
        self.userID = userID
        self.scope = scope
        self.preference = preference
        self.launchSnapshots = launchSnapshots
        self.drafts = drafts
    }

    /// The snapshot a cold launch paints: the persisted Server's, never
    /// another Server's, and only while it still lists that Server.
    public func launchSnapshot() async -> LaunchSnapshot? {
        guard !userID.isEmpty, let serverID = scope.serverID ?? preference.serverID else { return nil }
        guard let snapshot = await launchSnapshots.load(userID: userID, serverID: serverID),
              snapshot.servers.contains(where: { $0.id == serverID })
        else { return nil }
        return snapshot
    }

    /// Activates and persists `serverID`.
    public func activate(_ serverID: String) {
        scope.activate(serverID)
        preference.save(serverID)
    }

    /// Picks the active Server from a live `server.list`: the one already
    /// active or persisted while the viewer still belongs to it, else the
    /// first listed.
    public func adopt(_ servers: [ServerSummary]) -> ServerAdoption {
        let previous = scope.serverID
        guard let serverID = ServerSelection.activeServerID(
            in: servers,
            preferred: previous ?? preference.serverID
        ) else {
            scope.activate(nil)
            return .none(previous: previous)
        }
        activate(serverID)
        return previous == serverID ? .kept(serverID) : .activated(serverID, previous: previous)
    }

    /// The viewer lost `serverID`: its paint and drafts go, and it stops
    /// being the persisted choice. The next `adopt` picks another Server.
    public func membershipLost(_ serverID: String) async {
        await launchSnapshots.clear(serverID: serverID)
        drafts.clear(serverID: serverID)
        if preference.serverID == serverID { preference.clear() }
        if scope.isActive(serverID) { scope.activate(nil) }
    }

    /// Sign-out: every Server's paint, drafts, and staged files go, with the
    /// persisted choice. The scope stays as it is: the signed-out session's
    /// screens are torn down with it rather than redrawn without a Server.
    public func signOut() async {
        await launchSnapshots.clearAll()
        drafts.clearAll()
        preference.clear()
    }
}

public enum ServerAdoption: Equatable, Sendable {
    /// The viewer belongs to no Server.
    case none(previous: String?)
    /// The active Server stands.
    case kept(String)
    /// A different Server is active now. `previous` is the one whose state
    /// has to go, if any was showing.
    case activated(String, previous: String?)

    public var serverID: String? {
        switch self {
        case .none: nil
        case let .kept(serverID), let .activated(serverID, _): serverID
        }
    }
}
