import Foundation
import HausModels
import HausTransport
import Observation
import OSLog

/// The Server's Workers: every queued or running one the viewer can see,
/// each Chat's Workers once a Work view asks, and their pull request
/// readings. `worker.onUpdated` keeps what is held fresh.
@MainActor
@Observable
public final class WorkersModel {
    /// `worker.listActive`, oldest first. Nil until the first read.
    public internal(set) var active: [ActiveWorker]?
    /// `worker.listForChat`, per Chat a surface has asked about.
    public internal(set) var byChatID: [String: [ChatWorker]] = [:]
    /// `worker.get`, per Worker a Worker view has opened.
    public internal(set) var byID: [String: Worker] = [:]

    @ObservationIgnored let client: TRPCClient
    @ObservationIgnored let scope: ServerScope
    @ObservationIgnored var activeReads = ReadSequence<WholeList>()
    @ObservationIgnored var chatReads = ReadSequence<String>()
    @ObservationIgnored var workerReads = ReadSequence<String>()

    public init(client: TRPCClient, scope: ServerScope) {
        self.client = client
        self.scope = scope
    }

    public func reset() {
        active = nil
        byChatID = [:]
        byID = [:]
        activeReads.reset()
        chatReads.reset()
        workerReads.reset()
    }

    /// The freshest record held for a Worker: its own read, else any list
    /// that carries it.
    public func worker(id: String) -> Worker? {
        if let worker = byID[id] { return worker }
        if let listed = byChatID.values.lazy.flatMap({ $0 }).first(where: { $0.worker.id == id }) {
            return listed.worker
        }
        return active?.first { $0.work.id == id }?.work
    }

    /// The active rows still at work, for "Happening now". The active read
    /// can still carry a Worker whose job already finished while its turn's
    /// outcome lags, and that one is no longer happening.
    public var live: [ActiveWorker]? {
        active?.filter { Self.isLive($0.work.workerStatus) }
    }

    nonisolated static func isLive(_ status: WorkerStatus) -> Bool {
        switch status {
        case .queued, .working: true
        case .done, .failed, .stopped, .needsYou: false
        }
    }

    // MARK: - Reads

    public func loadActive() async {
        do {
            let read = try beginActiveRead()
            let rows = try await client.call(WorkerProcedures.listActive, ServerScopeInput(serverID: read.serverID)).rows
            landActive(rows, for: read)
        } catch ServerScopeError.serverUnavailable {
            return
        } catch {
            Self.logger.error("Loading active Workers failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    public func beginActiveRead() throws -> ScopedRead<WholeList> {
        try activeReads.begin(.all, in: scope)
    }

    @discardableResult
    public func landActive(_ rows: [ActiveWorker], for read: ScopedRead<WholeList>) -> Bool {
        guard scope.accepts(read, in: activeReads, reconciling: .activeWorkers) else { return false }
        if active != rows { active = rows }
        return true
    }

    public func loadChat(chatID: String) async throws {
        let read = try beginChatRead(chatID: chatID)
        let rows = try await client.call(WorkerProcedures.listForChat, WorkerChatInput(serverID: read.serverID, chatID: chatID))
        landChat(rows, for: read)
    }

    public func beginChatRead(chatID: String) throws -> ScopedRead<String> {
        try chatReads.begin(chatID, in: scope)
    }

    @discardableResult
    public func landChat(_ rows: [ChatWorker], for read: ScopedRead<String>) -> Bool {
        guard scope.accepts(read, in: chatReads) else { return false }
        if byChatID[read.key] != rows { byChatID[read.key] = rows }
        return true
    }

    public func loadWorker(id: String) async throws {
        let read = try beginWorkerRead(id: id)
        let worker = try await client.call(WorkerProcedures.get, WorkerTarget(serverID: read.serverID, workerID: id))
        landWorker(worker, for: read)
    }

    public func beginWorkerRead(id: String) throws -> ScopedRead<String> {
        try workerReads.begin(id, in: scope)
    }

    @discardableResult
    public func landWorker(_ worker: Worker, for read: ScopedRead<String>) -> Bool {
        guard scope.accepts(read, in: workerReads) else { return false }
        if byID[read.key] != worker { byID[read.key] = worker }
        return true
    }

    // MARK: - Pull requests

    /// The pull request readings of one Chat's Workers, newest Worker first.
    public func pullRequests(chatID: String) -> [WorkerPullRequest] {
        (byChatID[chatID] ?? [])
            .map(\.worker)
            .sorted { $0.updatedAt > $1.updatedAt }
            .flatMap { $0.pullRequests ?? [] }
    }

    // MARK: - Writes

    public func stop(workerID: String) async throws -> Worker {
        let ticket = try scope.requireTicket()
        let worker = try await client.call(WorkerProcedures.stop, WorkerTarget(serverID: ticket.serverID, workerID: workerID)).worker
        adopt(worker)
        return worker
    }

    public func sendFollowUp(workerID: String, text: String, nonce: String) async throws -> WorkerFollowUpReceipt {
        let ticket = try scope.requireTicket()
        guard let input = WorkerFollowUpInput(serverID: ticket.serverID, workerID: workerID, text: text, nonce: nonce) else {
            throw WorkerFollowUpError.invalid
        }
        let receipt = try await client.call(WorkerProcedures.sendFollowUp, input)
        adopt(receipt.worker)
        return receipt
    }

    /// A write's receipt carries the Worker as the Server now holds it, which
    /// outranks any read still in flight.
    private func adopt(_ worker: Worker) {
        guard let read = try? beginWorkerRead(id: worker.id) else { return }
        landWorker(worker, for: read)
    }

    // MARK: - Realtime

    /// The reads one batch of live events asks for, against what is held.
    /// `parentChatIDs` are the places the changed Workers' Task chats were
    /// started from, whose Work lists carry them too.
    public func apply(_ effects: ChatRealtimeEffects, parentChatIDs: Set<String> = []) async {
        let readsActive = effects.reloadsActiveWorkers && active != nil
        let chatIDs = heldChats(affectedBy: effects.cloudAgentWorkIDs, in: effects.cloudAgentWorkChatIDs.union(parentChatIDs))
        let workerIDs = effects.cloudAgentWorkIDs.filter { byID[$0] != nil }
        await withTaskGroup(of: Void.self) { group in
            if readsActive { group.addTask { await self.loadActive() } }
            for chatID in chatIDs {
                group.addTask { await self.logged { try await self.loadChat(chatID: chatID) } }
            }
            for workerID in workerIDs {
                group.addTask { await self.logged { try await self.loadWorker(id: workerID) } }
            }
        }
    }

    /// Held Chat lists an event touches: those it names, and those already
    /// listing a Worker that changed.
    public func heldChats(affectedBy workerIDs: Set<String>, in chatIDs: Set<String>) -> Set<String> {
        Set(byChatID.compactMap { chatID, rows in
            chatIDs.contains(chatID) || rows.contains { workerIDs.contains($0.worker.id) } ? chatID : nil
        })
    }

    /// A stream start reconciles what it owns, against what is held.
    public func recover(_ projections: Set<RealtimeProjection>) async {
        guard projections.contains(.activeWorkers) else { return }
        let chatIDs = Array(byChatID.keys)
        let workerIDs = Array(byID.keys)
        await withTaskGroup(of: Void.self) { group in
            if active != nil { group.addTask { await self.loadActive() } }
            for chatID in chatIDs {
                group.addTask { await self.logged { try await self.loadChat(chatID: chatID) } }
            }
            for workerID in workerIDs {
                group.addTask { await self.logged { try await self.loadWorker(id: workerID) } }
            }
        }
    }

    private func logged(_ read: () async throws -> Void) async {
        do {
            try await read()
        } catch {
            Self.logger.error("Refreshing Workers failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    static let logger = Logger(subsystem: "chat.haus.ios", category: "workers")
}

public enum WorkerFollowUpError: LocalizedError, Equatable {
    case invalid

    public var errorDescription: String? {
        "A follow-up needs a message under 32,000 characters."
    }
}
