import Foundation
import HausAppModel
import HausModels

/// The on-disk launch snapshot: what paints a cold launch before the live
/// load answers. Each Server keeps its own (`LaunchSnapshotStore`), and a
/// launch paints only the active Server's.
extension HausStore {
    /// Writes coalesce into one per window, so a burst of events costs one
    /// encode rather than one per frame.
    static let launchSnapshotWriteWindow = Duration.seconds(2)

    /// Paints the last state this user saw on the persisted Server, if a
    /// usable snapshot exists. Returns whether it did; the live load follows
    /// either way.
    func restoreLaunchSnapshot() async -> Bool {
        guard case .idle = state, let snapshot = await lifecycle.launchSnapshot(), case .idle = state else {
            return false
        }
        paint(snapshot)
        return true
    }

    /// Shows a snapshot as the active Server's state, ahead of its live load.
    func paint(_ snapshot: LaunchSnapshot) {
        servers = snapshot.servers
        lifecycle.activate(snapshot.serverID)
        chats = snapshot.chats
        agents = snapshot.agents
        members = snapshot.members
        for (chatID, page) in snapshot.pagesByChatID {
            writeTranscript(page, to: .chat(chatID), as: .replace)
            historyNavigation.retention.touch(chatID)
        }
        state = .loaded
        // Connecting, not offline: the live load reports an outage if it has one.
        markConnected()
    }

    /// Schedules a write unless one is already pending. Only live state is
    /// persisted; a launch still showing its disk paint has nothing new.
    func scheduleLaunchSnapshotWrite() {
        guard hasLiveServerState, launchSnapshotWrite == nil else { return }
        launchSnapshotWrite = Task { [weak self] in
            try? await Task.sleep(for: Self.launchSnapshotWriteWindow)
            guard !Task.isCancelled, let self else { return }
            launchSnapshotWrite = nil
            await writeLaunchSnapshot()
        }
    }

    /// Writes now: the app is leaving the foreground, or the Server is about
    /// to change, and this state may not come back.
    func flushLaunchSnapshot() async {
        cancelLaunchSnapshotWrite()
        await writeLaunchSnapshot()
    }

    func cancelLaunchSnapshotWrite() {
        launchSnapshotWrite?.cancel()
        launchSnapshotWrite = nil
    }

    private func writeLaunchSnapshot() async {
        guard let snapshot = makeLaunchSnapshot() else { return }
        do {
            // The store is an actor, so the encode and the write run off the
            // main actor.
            try await lifecycle.launchSnapshots.save(snapshot)
        } catch {
            Self.logger.warning("Launch snapshot write failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    private func makeLaunchSnapshot() -> LaunchSnapshot? {
        guard hasLiveServerState, let serverID = activeServer?.id else { return nil }
        // The surfaces the user lands on first, then the most recently used.
        let priority = openChatIDs.sorted() + [preferredInitialChatID].compactMap { $0 }
            + historyNavigation.retention.orderedChatIDs.reversed()
        return LaunchSnapshot(
            appProtocolVersion: lifecycle.launchSnapshots.appProtocolVersion,
            userID: viewer.id,
            serverID: serverID,
            servers: servers,
            chats: chats,
            agents: agents,
            members: members,
            pagesByChatID: LaunchSnapshot.pages(messagesByChatID, priority: priority)
        )
    }
}
