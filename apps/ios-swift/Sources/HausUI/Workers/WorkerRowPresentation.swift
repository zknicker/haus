import Foundation
import HausModels

/// One Worker in a Work list: a status glyph, the title, then how long it has
/// worked, where, and for which Task.
public struct WorkerRowPresentation: Hashable, Sendable, Identifiable {
    public enum Glyph: Hashable, Sendable { case working, finished, needsYou, failed, stopped }

    public let id: String
    public let title: String
    /// The meta in reading order: state, place, then Task. A line too narrow
    /// for all of them drops them from the end rather than cutting one off.
    public let subtitleParts: [String]
    public let glyph: Glyph

    public var subtitle: String { subtitleParts.joined(separator: Self.separator) }
    public var isLive: Bool { glyph == .working }

    static let separator = " · "

    public init(worker: Worker, taskKey: String? = nil, now: Date) {
        id = worker.id
        title = worker.title
        glyph = Self.glyph(worker.workerStatus)
        subtitleParts = [
            Self.state(worker, now: now),
            WorkerPlaceNaming.placeName(worker.place),
            taskKey,
        ].compactMap(\.self)
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
            return WorkerDuration.stated(now.timeIntervalSince(startedAt)).map { "Working for \($0)" } ?? "Working"
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

    /// The settled turns' total, or nil when there is none worth stating.
    static func workedFor(_ worker: Worker) -> String? {
        let spans = worker.runs.compactMap { WorkerTurnRecord(turn: $0).span }
        guard !spans.isEmpty else { return nil }
        return WorkerDuration.stated(spans.reduce(0, +))
    }
}
