import Foundation
import HausAppModel
import HausModels
import HausUI

/// What the Worker, pull request, and Drive file routes read from the Store.
extension HausStore {
    /// Every pull request the App holds a reading for: from loaded Tasks and
    /// every Worker a list or a Worker view has read.
    func knownPullRequests(now: Date) -> [PullRequestPresentation] {
        let held = workers.byChatID.values.flatMap { $0.map(\.worker) } + Array(workers.byID.values)
        var seen = Set<String>()
        let unique = held.filter { seen.insert($0.id).inserted }
        return PullRequestCatalog.presentations(
            tasks: Array(tasks.detailsByID.values),
            workers: unique.map { WorkerPresentation(work: $0) },
            captains: pullRequestAuthors,
            now: now
        )
    }

    /// The route's reading with what the place knows about it, freshest first.
    func pullRequestPresentation(_ reading: PullRequestReading, now: Date) -> PullRequestPresentation {
        knownPullRequests(now: now).first { $0.id == reading.id } ?? PullRequestPresentation(reading: reading)
    }

    /// Whether a Worker can take a follow-up: it is not closed and its Task,
    /// when loaded, is still open. The Server has the last word.
    func canFollowUp(_ worker: Worker) -> Bool {
        guard worker.closedAt == nil, worker.closingAt == nil else { return false }
        guard let state = worker.taskId.flatMap({ tasks.detailsByID[$0]?.task.state }) else { return true }
        return state != .done && state != .canceled
    }

    func sendFollowUp(workerID: String, draft: WorkerFollowUpDraft) async throws {
        _ = try await workers.sendFollowUp(workerID: workerID, text: draft.text, nonce: draft.nonce)
    }

    func stopWorker(workerID: String) async throws {
        _ = try await workers.stop(workerID: workerID)
    }

    /// The Drive reads a file preview makes.
    var driveFileReads: DriveFileReads {
        DriveFileReads(
            text: { [drive] record in try await drive.text(record) },
            file: { artifact in
                guard let file = SharedArtifactReader.file else { throw SharedArtifactUnavailable.failed }
                return try await file(artifact)
            }
        )
    }
}
