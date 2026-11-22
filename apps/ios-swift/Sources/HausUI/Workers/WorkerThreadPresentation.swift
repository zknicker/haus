import Foundation
import HausModels

/// One line of the Worker view, oldest first.
public enum WorkerThreadEntry: Hashable, Sendable, Identifiable {
    case prompt(id: String, text: String)
    /// "Worked for 14m" over a turn's steps, or the live "Working for 2m".
    case divider(id: String, text: String, live: Bool)
    case steps(id: String, groups: [WorkerStepGroup])
    case report(id: String, text: String)
    case citations(id: String, pullRequests: [WorkerCitedPullRequest], files: [String])
    /// "Finished, worked for 14m" after a settled turn.
    case settlement(id: String, text: String)

    public var id: String {
        switch self {
        case .prompt(let id, _), .divider(let id, _, _), .steps(let id, _), .report(let id, _),
             .citations(let id, _, _), .settlement(let id, _):
            id
        }
    }
}

/// A Worker as its view reads it: the title, where and how it runs, and its
/// turns as one conversation.
public struct WorkerThreadPresentation: Hashable, Sendable {
    public let title: String
    public let placeLine: String
    public let entries: [WorkerThreadEntry]

    /// - Parameters:
    ///   - turns: the Worker's turns, newest first like the wire. Nil reads them
    ///     from `worker.runs`.
    ///   - taskKey: the Task's key, such as "HAUS-41", when it is known.
    public init(worker: Worker, turns: [WorkerTurnRecord]? = nil, taskKey: String? = nil, now: Date) {
        let records = turns ?? worker.runs.map(WorkerTurnRecord.init(turn:))
        title = worker.title
        placeLine = Self.placeLine(worker: worker, taskKey: taskKey)
        entries = records.reversed().flatMap { Self.entries(for: $0, now: now) }
    }

    static func entries(for turn: WorkerTurnRecord, now: Date) -> [WorkerThreadEntry] {
        var entries = turn.prompts.enumerated().map { index, text in
            WorkerThreadEntry.prompt(id: "\(turn.id):prompt:\(index)", text: text)
        }
        if turn.isLive || !turn.steps.isEmpty {
            entries.append(.divider(id: "\(turn.id):divider", text: dividerText(turn, now: now), live: turn.isLive))
        }
        if !turn.steps.isEmpty {
            entries.append(.steps(id: "\(turn.id):steps", groups: WorkerStepFold.groups(turn.steps, live: turn.isLive)))
        }
        if let report = turn.report?.trimmingCharacters(in: .whitespacesAndNewlines), !report.isEmpty {
            entries.append(.report(id: "\(turn.id):report", text: report))
        }
        if !turn.pullRequests.isEmpty || !turn.files.isEmpty {
            entries.append(.citations(id: "\(turn.id):citations", pullRequests: turn.pullRequests, files: turn.files))
        }
        if let outcome = turn.outcome {
            entries.append(.settlement(id: "\(turn.id):settlement", text: settlementText(outcome, span: turn.span)))
        }
        return entries
    }

    static func dividerText(_ turn: WorkerTurnRecord, now: Date) -> String {
        guard turn.isLive else {
            return turn.span.map { "Worked for \(WorkerDuration.text($0))" } ?? "Worked"
        }
        guard let startedAt = turn.startedAt else { return "Starting" }
        return "Working for \(WorkerDuration.text(now.timeIntervalSince(startedAt)))"
    }

    static func settlementText(_ outcome: WorkerTurnRecord.Outcome, span: TimeInterval?) -> String {
        let label = switch outcome {
        case .finished: "Finished"
        case .needsYou: "Needs you"
        case .failed(let reason): reason.map { "Failed: \($0)" } ?? "Failed"
        case .stopped: "Stopped"
        }
        guard let span else { return label }
        return "\(label), worked for \(WorkerDuration.text(span))"
    }

    static func placeLine(worker: Worker, taskKey: String?) -> String {
        let parts = [
            "On \(WorkerPlaceNaming.placeName(worker.place))",
            WorkerPlaceNaming.harnessName(worker),
            taskKey.map { "from \($0)" },
        ]
        return parts.compactMap(\.self).joined(separator: " · ")
    }
}

/// The Worker duration grammar: `45s`, `25m`, `2h 5m`, never seconds past a minute.
public enum WorkerDuration {
    public static func text(_ interval: TimeInterval) -> String {
        WorkerPresentation.duration(seconds: Int(interval.rounded(.down)))
    }
}

/// How a Worker's place and harness are named.
public enum WorkerPlaceNaming {
    /// A Device by its name; a cloud place by its provider.
    public static func placeName(_ place: WorkerPlace) -> String {
        place.kind == "computer"
            ? place.computerName ?? "Device"
            : WorkerPresentation.providerName(place.kind)
    }

    /// The runtime a Device runs the Worker with; cloud places name none.
    public static func harnessName(_ worker: Worker) -> String? {
        worker.runtime.map { settingsRuntimeDisplayName($0.rawValue) }
    }
}
