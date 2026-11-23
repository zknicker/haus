import Foundation
import HausAppModel
import HausModels

/// Switching Servers (specs/ios-app.md, Server lifecycle): stop the old
/// Server's streams and reads, persist the choice, paint the new Server's
/// snapshot, then load it live. The router calls this; it resets its own
/// stacks.
extension HausStore {
    func switchServer(_ serverID: String) async {
        guard activeServer?.id != serverID, servers.contains(where: { $0.id == serverID }) else { return }
        if hasLiveServerState { await flushLaunchSnapshot() }
        guard activeServer?.id != serverID else { return }
        leaveActiveServer()
        lifecycle.activate(serverID)
        if let snapshot = await lifecycle.launchSnapshot(), scope.isActive(serverID) {
            paint(snapshot)
        } else {
            state = .loading
        }
        guard scope.isActive(serverID) else { return }
        await loadLiveServer(attempt: 0)
    }

    /// Everything the active Server owns stops and goes: its streams, its
    /// in-flight reads (late answers are dropped by the new activation), its
    /// pending snapshot write and launch retry, and the state it painted.
    func leaveActiveServer() {
        stopEventStreams()
        launchRetry?.cancel()
        launchRetry = nil
        cancelLaunchSnapshotWrite()
        cancelTranscriptReads()
        resetInlineReplyCache()
        discardServerScopedState()
        hasLiveServerState = false
    }
}
