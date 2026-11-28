import Foundation
import HausModels

/// Task reads live in `TasksModel`; these are the names the views use.
extension HausStore {
    func taskDetail(taskID: String) -> TaskDetail? {
        tasks.detailsByID[taskID]
    }

    func reloadTaskDetail(taskID: String) async throws {
        try await tasks.reloadDetail(taskID: taskID)
    }

    func activeServerID() throws -> String {
        guard let serverID = activeServer?.id else { throw HausStoreError.serverUnavailable }
        return serverID
    }
}
