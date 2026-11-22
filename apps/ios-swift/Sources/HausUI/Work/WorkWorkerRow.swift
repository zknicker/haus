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

/// The words a Worker row and a Worker report link use.
enum WorkWorkerLine {
    /// `Working for 6m · mini · HAUS-41`.
    static func meta(_ item: WorkWorkerItem, now: Date) -> [String] {
        [phrase(item.worker.work.job, now: now), place(item.worker.work), item.taskKey].compactMap { $0 }
    }

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

    /// The Device a Worker runs on, else its harness, else its provider.
    static func place(_ worker: Worker) -> String? {
        if let computerName = worker.place.computerName { return computerName }
        switch worker.runtime {
        case .claudeCode: return "Claude Code"
        case .codex: return "Codex"
        case nil: return WorkerPresentation.providerName(worker.provider)
        }
    }

    private static func elapsed(_ start: Date?, _ end: Date?) -> String? {
        guard let start, let end else { return nil }
        return WorkerPresentation.duration(from: start, to: end)
    }
}

/// A Worker row in the Work view.
///
/// A stand-in until `HausUI/Workers/WorkerRow` lands: swap this view for it in
/// ``WorkView`` and delete this one; ``WorkWorkerItem`` stays the seam.
struct WorkWorkerRow: View {
    let item: WorkWorkerItem
    let now: Date

    var body: some View {
        WorkListRow(title: item.worker.work.title) {
            glyph
        } meta: {
            WorkMetaLine(pieces: WorkWorkerLine.meta(item, now: now))
        }
    }

    @ViewBuilder
    private var glyph: some View {
        if item.isRunning {
            DotGrid(dot: 2.5, gap: 2)
                .foregroundStyle(HausPlatformColor.mutedInk)
        } else {
            Image(systemName: item.worker.work.job.state == .done ? "checkmark" : "xmark")
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(HausPlatformColor.mutedInk)
        }
    }
}
