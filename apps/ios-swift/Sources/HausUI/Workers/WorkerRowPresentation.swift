import Foundation
import HausModels

/// One Worker in a Work list: a status glyph, the title, then how long it has
/// worked, where, and for which Task.
public struct WorkerRowPresentation: Hashable, Sendable, Identifiable {
    public enum Glyph: Hashable, Sendable { case working, finished, needsYou, failed, stopped }

    public let id: String
    public let title: String
    public let subtitle: String
    public let glyph: Glyph

    public var isLive: Bool { glyph == .working }

    public init(worker: Worker, taskKey: String? = nil, now: Date) {
        id = worker.id
        title = worker.title
        glyph = Self.glyph(worker.workerStatus)
        let parts = [
            Self.state(worker, now: now),
            WorkerPlaceNaming.placeName(worker.place),
            taskKey,
        ]
        subtitle = parts.compactMap(\.self).joined(separator: " · ")
    }

    static func glyph(_ status: WorkerStatus) -> Glyph {
        switch status {
        case .queued, .working: .working
        case .done: .finished
        case .needsYou: .needsYou
        case .failed: .failed
        case .stopped: .stopped
        }
    }

    /// "Working for 6m" from the live turn's start; "Worked for 28m" across
    /// every settled turn.
    static func state(_ worker: Worker, now: Date) -> String {
        switch worker.workerStatus {
        case .queued, .working:
            guard let startedAt = worker.runs.first?.startedAt else { return "Starting" }
            return "Working for \(WorkerDuration.text(now.timeIntervalSince(startedAt)))"
        case .done:
            return workedFor(worker).map { "Worked for \($0)" } ?? "Finished"
        case .needsYou:
            return "Needs you"
        case .failed:
            return "Failed"
        case .stopped:
            return "Stopped"
        }
    }

    static func workedFor(_ worker: Worker) -> String? {
        let spans = worker.runs.compactMap { WorkerTurnRecord(turn: $0).span }
        guard !spans.isEmpty else { return nil }
        return WorkerDuration.text(spans.reduce(0, +))
    }
}
