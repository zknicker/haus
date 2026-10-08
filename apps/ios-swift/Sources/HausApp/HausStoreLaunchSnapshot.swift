import Foundation
import HausModels

/// The on-disk launch snapshot: what paints a cold launch before the live
/// load answers. See `LaunchSnapshot` for the scoping rules.
extension HausStore {
    /// Writes coalesce into one per window, so a burst of events costs one
    /// encode rather than one per frame.
    static let launchSnapshotWriteWindow = Duration.seconds(2)

    /// Paints the last state this user saw, if a usable snapshot exists.
    /// Returns whether it did; the live load follows either way.
    func restoreLaunchSnapshot() async -> Bool {
        guard let userID = clerk.user?.id,
              let snapshot = await launchSnapshots.load(userID: userID),
              snapshot.serverID != nil,
              case .idle = state
        else { return false }

        servers = snapshot.servers
        chats = snapshot.chats
        agents = snapshot.agents
        members = snapshot.members
        messagesByChatID = snapshot.pagesByChatID
        serverUsage = snapshot.serverUsage
        for chatID in snapshot.pagesByChatID.keys {
            historyNavigation.retention.touch(chatID)
        }
        state = .loaded
        // Connecting, not offline: the live load reports an outage if it has one.
        markConnected()
        return true
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

    /// Writes now — the app is leaving the foreground and may not return.
    func flushLaunchSnapshot() async {
        launchSnapshotWrite?.cancel()
        launchSnapshotWrite = nil
        await writeLaunchSnapshot()
    }

    /// Sign-out: nothing of this account may paint the next one's launch.
    func clearLaunchSnapshot() async {
        hasLiveServerState = false
        launchSnapshotWrite?.cancel()
        launchSnapshotWrite = nil
        await launchSnapshots.clear()
    }

    private func writeLaunchSnapshot() async {
        guard let snapshot = makeLaunchSnapshot() else { return }
        do {
            // The store is an actor, so the encode and the write run off the
            // main actor.
            try await launchSnapshots.save(snapshot)
        } catch {
            Self.logger.warning("Launch snapshot write failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    private func makeLaunchSnapshot() -> LaunchSnapshot? {
        guard hasLiveServerState, let userID = clerk.user?.id, !servers.isEmpty else { return nil }
        // The surfaces the user lands on first, then the most recently used.
        let priority = [canvasChatID, openChatID, preferredInitialChatID].compactMap { $0 }
            + historyNavigation.retention.orderedChatIDs.reversed()
        return LaunchSnapshot(
            userID: userID,
            servers: servers,
            chats: chats,
            agents: agents,
            members: members,
            pagesByChatID: LaunchSnapshot.pages(messagesByChatID, priority: priority),
            serverUsage: serverUsage
        )
    }
}
