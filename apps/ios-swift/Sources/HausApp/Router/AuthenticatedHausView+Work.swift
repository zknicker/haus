import HausAppModel
import HausModels
import HausUI
import SwiftUI

/// The Work routes: a place's Work view, a pull request, and Drive. Each
/// draws the freshest Server record held, blank until one arrives, and reads
/// on appear so a reopened screen catches up.
extension AuthenticatedHausView {
    func workDestination(_ place: HausWorkPlace) -> some View {
        WorkView(
            content: store.workContent(place),
            actions: WorkViewActions(
                openPullRequest: { router.open(.pullRequest($0.reading)) },
                openFile: { router.open(.driveFile(path: $0.metadata.path)) }
            )
        )
        .task(id: place) {
            await store.loadWork(place, includingFiles: true)
        }
    }

    func pullRequestDestination(_ reading: PullRequestReading) -> some View {
        PullRequestDetailView(
            pullRequest: store.pullRequestPresentation(reading),
            actions: PullRequestDetailActions(openTask: { router.open(.task(taskID: $0.id)) })
        )
    }

    func driveFolderDestination(_ prefix: String) -> some View {
        let listing = store.drive.listing.flatMap { $0.query.prefix == prefix ? $0.page : nil }
        return DriveBrowserView(
            title: prefix.isEmpty ? "Files" : String(prefix.dropLast()),
            listing: listing.map {
                HausUI.DriveListing(folders: $0.folders, files: $0.artifacts.map(store.driveFilePresentation))
            },
            onOpenFolder: { router.open(.driveFile(path: DrivePath.folder($0.path))) },
            onOpenFile: { router.open(.driveFile(path: $0.metadata.path)) }
        )
        .onAppear {
            Task { try? await store.drive.show(DriveQuery(prefix: prefix)) }
        }
    }

    func driveFileDestination(_ path: String) -> some View {
        RouteRecordView(
            record: store.drive.fileByPath[path],
            key: path,
            unavailableTitle: "File unavailable",
            load: { try await store.drive.loadFile(path: path) }
        ) { record in
            DriveFileView(file: store.driveFilePresentation(record), reads: store.driveFileReads)
        }
    }
}
