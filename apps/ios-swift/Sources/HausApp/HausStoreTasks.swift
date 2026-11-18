import Foundation
import HausModels
import OSLog

extension HausStore {
    func taskDetail(taskID: String) -> TaskDetail? {
        taskSnapshots.detailsByID[taskID]
    }

    // MARK: - Reads

    func reloadTaskDetail(taskID: String) async throws {
        let serverID = try activeServerID()
        let token = nextTaskRead(taskID)
        let detail: TaskDetail = try await client.query(
            "task.get",
            input: TaskGetInput(serverID: serverID, taskID: taskID)
        )
        guard activeServer?.id == serverID, isNewestTaskRead(taskID, token) else { return }
        if taskSnapshots.detailsByID[taskID] != detail { taskSnapshots.detailsByID[taskID] = detail }
    }

    func reloadTaskLabels() async throws {
        let serverID = try activeServerID()
        let labels: [TaskLabel] = try await client.query(
            "taskLabel.list",
            input: ServerScopedInput(serverId: serverID)
        )
        guard activeServer?.id == serverID else { return }
        if taskSnapshots.labels != labels { taskSnapshots.labels = labels }
    }

    /// The reads one batch of live events asks for, against what is held.
    func applyTaskEffects(_ effects: ChatRealtimeEffects) async {
        let snapshots = taskSnapshots
        let detailIDs = effects.changedTaskIDs.filter { snapshots.detailsByID[$0] != nil }
        let readsLabels = !effects.changedLabelIDs.isEmpty && snapshots.labels != nil

        await withTaskGroup(of: Void.self) { group in
            if readsLabels { group.addTask { await self.logged { try await self.reloadTaskLabels() } } }
            for taskID in detailIDs {
                group.addTask { await self.logged { try await self.reloadTaskDetail(taskID: taskID) } }
            }
        }
    }

    /// A stream start reconciles what it owns, against what is held.
    func recoverTaskProjections(_ projections: Set<RealtimeProjection>) async {
        let snapshots = taskSnapshots
        await withTaskGroup(of: Void.self) { group in
            if projections.contains(.taskLabels), snapshots.labels != nil {
                group.addTask { await self.logged { try await self.reloadTaskLabels() } }
            }
            if projections.contains(.taskDetails) {
                group.addTask { await self.recoverTaskDetails() }
            }
        }
    }

    private func recoverTaskDetails() async {
        let readStart = realtimeReconciliation.beginRead()
        let taskIDs = Array(taskSnapshots.detailsByID.keys)
        await withTaskGroup(of: Void.self) { group in
            for taskID in taskIDs {
                group.addTask { await self.logged { try await self.reloadTaskDetail(taskID: taskID) } }
            }
        }
        realtimeReconciliation.landed(.taskDetails, readStartedAt: readStart)
    }

    // MARK: - Support

    func activeServerID() throws -> String {
        guard let serverID = activeServer?.id else { throw HausStoreError.serverUnavailable }
        return serverID
    }

    /// A background read that failed keeps the previous snapshot and is logged:
    /// a stale row is honest, and nobody asked for this read.
    private func logged(_ read: () async throws -> Void) async {
        do {
            try await read()
        } catch {
            Self.logger.error("Refreshing tasks failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    private func nextTaskRead(_ taskID: String) -> Int {
        let token = (taskSnapshots.readTokens[taskID] ?? 0) + 1
        taskSnapshots.readTokens[taskID] = token
        return token
    }

    private func isNewestTaskRead(_ taskID: String, _ token: Int) -> Bool {
        taskSnapshots.readTokens[taskID] == token
    }
}
