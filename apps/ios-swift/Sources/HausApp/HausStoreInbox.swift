import Foundation
import HausModels
import OSLog

/// The Server-wide reads the Inbox and its sidebar badge stand on: the viewer's
/// open Asks, the default Task lens, the Cloud Agent work running right now,
/// and the Server's token-usage snapshot.
///
/// Each snapshot lives on the Store rather than on a screen because the badge
/// outlives the Inbox: a durable event refreshes what this client already
/// holds, and nothing here pulls in a read nobody has asked for. A failed
/// refresh keeps the previous snapshot and is logged — a stale Inbox row is
/// honest, while a Chat-level send alert for a background read is not.
extension HausStore {
    /// Every Server-wide Inbox read at once, for a surface that shows all of
    /// them. The reads are independent, so they run concurrently.
    func loadInbox() async {
        async let asks: Void = loadOpenAsks()
        async let tasks: Void = loadInboxTasks()
        async let work: Void = loadActiveCloudAgentWork()
        async let usage: Void = loadServerUsage()
        _ = await (asks, tasks, work, usage)
    }

    /// The viewer's open Asks on this Server, oldest first. Server membership
    /// and Chat access gate the read, so an Ask the viewer lost access to
    /// simply stops arriving and no surface has to filter one out.
    func loadOpenAsks() async {
        guard let serverID = activeServer?.id else { return }
        do {
            let rows: [OpenAsk] = try await client.query(
                "ask.listOpen",
                input: ServerScopedInput(serverId: serverID)
            )
            guard activeServer?.id == serverID else { return }
            if openAsks != rows { openAsks = rows }
        } catch {
            Self.logger.error("Loading open asks failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    /// The Server-wide default Task lens, which is what the "Needs you" count
    /// reads its stalled claims from.
    func loadInboxTasks() async {
        guard let serverID = activeServer?.id else { return }
        do {
            let tasks = try await loadTasks()
            guard activeServer?.id == serverID else { return }
            if inboxTasks != tasks { inboxTasks = tasks }
        } catch {
            Self.logger.error("Loading inbox tasks failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    /// Every queued or running Cloud Agent work the viewer can see on this
    /// Server, oldest first. `cloud-agent-work.updated` owns the refresh.
    func loadActiveCloudAgentWork() async {
        guard let serverID = activeServer?.id else { return }
        do {
            let rows: [ActiveCloudAgentWork] = try await client.query(
                "cloudAgentWork.listActive",
                input: ServerScopedInput(serverId: serverID)
            )
            guard activeServer?.id == serverID else { return }
            if activeCloudAgentWork != rows { activeCloudAgentWork = rows }
        } catch {
            Self.logger.error("Loading active cloud agent work failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    /// One Server-wide usage read the Inbox slices per Agent through
    /// `AgentTokenUsage.summarize`. Ranking a week is a question about every
    /// Agent at once, so a per-Agent read was never the right shape for it.
    func loadServerUsage() async {
        guard let serverID = activeServer?.id else { return }
        do {
            let snapshot: ServerUsageSnapshot = try await client.query(
                "stats.live",
                input: ServerScopedInput(serverId: serverID)
            )
            guard activeServer?.id == serverID else { return }
            if serverUsage != snapshot { serverUsage = snapshot }
        } catch {
            Self.logger.error("Loading server usage failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    /// How much work is waiting on this human right now, for surfaces that
    /// badge the Inbox instead of opening it.
    ///
    /// Zero until both reads have landed: a badge that counted Asks now and
    /// Tasks a moment later would tick upward in front of the reader. Ask
    /// `isNeedsYouCountReady` to tell "nothing waiting" from "not yet known".
    var needsYouCount: Int {
        guard let openAsks, let inboxTasks else { return 0 }
        return InboxNeedsYou.count(askCount: openAsks.count, tasks: inboxTasks.map(\.task))
    }

    var isNeedsYouCountReady: Bool { openAsks != nil && inboxTasks != nil }

    /// One Agent's week, sliced from the Server usage snapshot the Inbox
    /// already holds. Nil until that read lands, so a strip is blank rather
    /// than ranked against a half-loaded window.
    func agentUsageWeek(agentID: String, asOf: Date = Date()) -> AgentUsageSummary? {
        guard let serverUsage else { return nil }
        return AgentTokenUsage.summarize(serverUsage.tokenUsage, agentID: agentID, asOf: asOf)
    }
}
