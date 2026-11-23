import Foundation
import HausAppModel
import HausModels
import HausUI

/// You's Server-wide reads and writes beyond `settingsData`: Projects, model
/// connections, Drive folders, and the Devices' Workers switch.
extension HausStore {
    func settingsServerContent(openDriveFile: @escaping @MainActor (DriveFilePresentation) -> Void) -> SettingsServerContent {
        SettingsServerContent(
            projects: settingsProjects,
            modelConnections: modelConnections.map { read in
                read.connections.sorted { $0.position < $1.position }.map(SettingsModelConnection.init)
            },
            reloadProjects: { [tasks] in try await tasks.reloadProjects() },
            loadDrive: { [weak self] prefix in
                guard let self else { throw CancellationError() }
                return try await self.driveFolder(prefix: prefix)
            },
            openDriveFile: openDriveFile,
            setWorkers: { [weak self] computerID, enabled in
                guard let self else { throw CancellationError() }
                try await self.setComputerWorkers(computerID: computerID, enabled: enabled)
            }
        )
    }

    /// One `artifact.list` page for a folder, read without touching the
    /// shared Drive listing so every pushed folder keeps its own.
    func driveFolder(prefix: String) async throws -> HausUI.DriveListing {
        guard let serverID = activeServer?.id else { throw HausStoreError.serverUnavailable }
        guard let input = DriveQuery(prefix: prefix).input(serverID: serverID) else { throw DriveQueryError.tooLong }
        let page = try await client.call(DriveProcedures.list, input)
        return HausUI.DriveListing(folders: page.folders, files: page.artifacts.map { DriveFilePresentation(record: $0) })
    }

    /// `computer.setWorkers`; `computer.onUpdated` brings the Devices read up to date.
    func setComputerWorkers(computerID: String, enabled: Bool) async throws {
        guard let serverID = activeServer?.id else { throw HausStoreError.serverUnavailable }
        _ = try await client.call(
            ComputerWorkersProcedures.setWorkers,
            ComputerSetWorkersInput(computerID: computerID, enabled: enabled, serverID: serverID)
        )
    }

    /// The Projects tab's own set, the joined Channels in the same order, each
    /// with the setup its Project record carries once `project.list` lands.
    /// Blank until the Chat list has loaded.
    private var settingsProjects: [SettingsProject]? {
        guard hasLoadedChats else { return nil }
        let records = tasks.projects ?? projects.projects ?? []
        return projectRows.map { row in
            guard let project = records.first(where: { $0.chatID == row.chatID }) else {
                return SettingsProject(id: row.chatID, name: row.name, key: "")
            }
            return SettingsProject(
                id: project.id,
                name: row.name,
                key: project.key.rawValue,
                repositories: project.repos.map(\.repository),
                defaultWorkerPlace: project.defaultWorkerPlace.map(workerPlaceLabel)
            )
        }
    }

    private func workerPlaceLabel(_ place: WorkerPlace) -> String {
        switch place.kind {
        case "computer": place.computerName ?? "A Device"
        case "cursor": "Cursor"
        case "claude": "Claude cloud"
        default: place.kind
        }
    }
}
