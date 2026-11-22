import HausAppModel
import HausModels
import HausUI
import SwiftUI
#if canImport(UIKit)
import UIKit
#endif

/// The Work routes: a place's Work view, a Worker, a pull request, and Drive.
/// Each draws the freshest Server record held, blank until one arrives, and
/// reads on appear so a reopened screen catches up.
extension AuthenticatedHausView {
    func workDestination(_ place: HausWorkPlace) -> some View {
        WorkView(
            content: store.workContent(place, now: .now),
            actions: WorkViewActions(
                openWorker: { router.open(.worker(workerID: $0.id)) },
                openPullRequest: { router.open(.pullRequest($0.reading)) },
                openFile: { router.open(.driveFile(path: $0.metadata.path)) }
            )
        )
        .task(id: place) {
            if case .task(let taskID) = place { try? await store.reloadTaskDetail(taskID: taskID) }
            await store.loadWork(place, includingFiles: true)
        }
    }

    func workerDestination(_ workerID: String) -> some View {
        RouteRecordView(
            record: store.workers.worker(id: workerID),
            key: workerID,
            unavailableTitle: "Worker unavailable",
            load: { try await store.workers.loadWorker(id: workerID) }
        ) { worker in
            WorkerView(
                worker: worker,
                taskKey: worker.taskId.flatMap(store.taskKey(taskID:)),
                canFollowUp: store.canFollowUp(worker),
                draft: store.draftBinding(for: .worker(workerID)),
                actions: workerActions(worker)
            )
        }
    }

    func pullRequestDestination(_ reading: PullRequestReading) -> some View {
        PullRequestDetailView(
            pullRequest: store.pullRequestPresentation(reading, now: .now),
            actions: PullRequestDetailActions(
                openTask: { router.open(.task(taskID: $0.id)) },
                openWorker: { router.open(.worker(workerID: $0.id)) }
            )
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

    private func workerActions(_ worker: Worker) -> WorkerViewActions {
        let workerID = worker.id
        let providerURL = WorkerPresentation.externalURL(worker.providerUrl)
        return WorkerViewActions(
            sendFollowUp: { try await store.sendFollowUp(workerID: workerID, draft: $0) },
            stop: { try await store.stopWorker(workerID: workerID) },
            openPullRequest: { cited in
                let known = store.knownPullRequests(now: .now)
                if let pullRequest = PullRequestLookup.find(cited: cited, in: known) {
                    router.open(.pullRequest(pullRequest.reading))
                } else if let url = cited.url {
                    openExternal(url)
                }
            },
            openFile: { router.open(.driveFile(path: $0)) },
            openInProvider: providerURL.map { url in { openExternal(url) } }
        )
    }

    private func openExternal(_ url: URL) {
        #if canImport(UIKit)
        UIApplication.shared.open(url)
        #endif
    }
}
