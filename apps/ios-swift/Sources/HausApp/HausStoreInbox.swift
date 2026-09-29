import Foundation
import HausModels
import OSLog

/// The Server-wide reads the Inbox and its sidebar badge stand on: the viewer's
/// Needs you rows, the Cloud Agent work running right now, and the Server's
/// token-usage snapshot.
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
        async let needsYou: Void = loadNeedsYou()
        async let work: Void = loadActiveCloudAgentWork()
        async let usage: Void = loadServerUsage()
        _ = await (needsYou, work, usage)
    }

    /// The Chats addressed to the viewer that they have not answered or marked
    /// Done (ADR 0037), newest first. `message.created` and `chat.read` own
    /// the refresh.
    func loadNeedsYou() async {
        guard let serverID = activeServer?.id else { return }
        do {
            let rows: [NeedsYouRow] = try await client.query(
                "inbox.needsYou",
                input: ServerScopedInput(serverId: serverID)
            )
            guard activeServer?.id == serverID else { return }
            if needsYouRows != rows { needsYouRows = rows }
        } catch {
            Self.logger.error("Loading needs you failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    /// Done on one row: it leaves at once, the Server records the sequence it
    /// covered and advances the read marker, and the refetch reconciles. A
    /// failed Done puts the row back, because nothing was recorded.
    func markNeedsYouDone(_ row: NeedsYouRow) async {
        guard let serverID = activeServer?.id else { return }
        needsYouDoneThrough[row.chatID] = row.latest.sequence
        defer { needsYouDoneThrough[row.chatID] = nil }
        do {
            let _: InboxMarkDoneResult = try await client.mutation(
                "inbox.markDone",
                input: InboxMarkDoneInput(serverID: serverID, row: row)
            )
            guard activeServer?.id == serverID else { return }
            await loadNeedsYou()
        } catch {
            Self.logger.error("Marking needs you done failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    /// The rows the Inbox shows: the Server's, less any Done still settling.
    /// Nil until the first read lands.
    var visibleNeedsYouRows: [NeedsYouRow]? {
        needsYouRows.map { NeedsYou.visible($0, doneThrough: needsYouDoneThrough) }
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

    /// How many conversations are waiting on this human right now, for
    /// surfaces that badge the Inbox instead of opening it — the same rows the
    /// section lists.
    ///
    /// Zero until the rows have landed. Ask `isNeedsYouCountReady` to tell
    /// "nothing waiting" from "not yet known".
    var needsYouCount: Int { visibleNeedsYouRows?.count ?? 0 }

    var isNeedsYouCountReady: Bool { needsYouRows != nil }

    /// One Agent's week, sliced from the Server usage snapshot the Inbox
    /// already holds. Nil until that read lands, so a strip is blank rather
    /// than ranked against a half-loaded window.
    func agentUsageWeek(agentID: String, asOf: Date = Date()) -> AgentUsageSummary? {
        guard let serverUsage else { return nil }
        return AgentTokenUsage.summarize(serverUsage.tokenUsage, agentID: agentID, asOf: asOf)
    }
}
