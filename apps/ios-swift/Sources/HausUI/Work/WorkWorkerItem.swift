import Foundation
import HausModels
import SwiftUI

/// A Worker as the Work view lists it, with the key of the Task it serves.
public struct WorkWorkerItem: Identifiable, Hashable, Sendable {
    public let worker: WorkerPresentation
    public let taskKey: String?

    public init(worker: WorkerPresentation, taskKey: String? = nil) {
        self.worker = worker
        self.taskKey = taskKey
    }

    public var id: String { worker.id }

    /// Working and waiting on input are running; every settled job is finished.
    public var isRunning: Bool {
        switch worker.work.job.state {
        case .working, .pendingInput: true
        case .done, .failed, .cancelled, .expired: false
        }
    }
}

/// The words a pull request's Worker report link uses.
enum WorkWorkerLine {
    static func phrase(_ job: WorkerJob, now: Date) -> String {
        switch job {
        case .working(let startedAt, _):
            startedAt.map { "Working for \(WorkerPresentation.duration(from: $0, to: now))" } ?? "Starting"
        case .done(let startedAt, let settledAt, _):
            elapsed(startedAt, settledAt).map { "Worked for \($0)" } ?? "Done"
        case .pendingInput: "Needs input"
        case .failed: "Failed"
        case .cancelled: "Stopped"
        case .expired: "Expired"
        }
    }

    /// `Finished, worked for 28m`, the Worker report's own line.
    static func reportPhrase(_ job: WorkerJob, now: Date) -> String {
        guard case .done(let startedAt, let settledAt, _) = job else { return phrase(job, now: now) }
        return elapsed(startedAt, settledAt).map { "Finished, worked for \($0)" } ?? "Finished"
    }

    private static func elapsed(_ start: Date?, _ end: Date?) -> String? {
        guard let start, let end else { return nil }
        return WorkerDuration.stated(end.timeIntervalSince(start))
    }
}

extension WorkWorkerItem {
    /// The row ``WorkerRow`` draws for this Worker.
    public func row(now: Date) -> WorkerRowPresentation {
        WorkerRowPresentation(worker: worker.work, taskKey: taskKey, now: now)
    }
}
