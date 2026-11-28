import Foundation
import HausAppModel
import HausModels
import HausUI

/// You's Server-wide reads beyond `settingsData`: Projects, model
/// connections, and Drive folders.
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
            openDriveFile: openDriveFile
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

    /// The joined Projects in the Projects tab's order, as the web App's
    /// Projects page lists them: Channels with a Project record, not `#all`.
    /// Blank until the Chat list and `project.list` have loaded.
    private var settingsProjects: [SettingsProject]? {
        guard hasLoadedChats, let records = tasks.projects ?? projects.projects else { return nil }
        return projectRows.compactMap { row in
            guard !row.isAll, let project = records.first(where: { $0.chatID == row.chatID }) else { return nil }
            return SettingsProject(
                id: project.id,
                name: row.name,
                key: project.key.rawValue,
                defaultMachine: project.defaultMachine.map { $0.computerName ?? "Device" }
            )
        }
    }
}
