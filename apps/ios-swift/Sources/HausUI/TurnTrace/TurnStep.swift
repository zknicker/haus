import Foundation
import HausModels

/// One row of a turn's steps in turn details.
struct TurnStep: Identifiable, Equatable, Sendable {
    let id: String
    let label: String
    let isRunning: Bool
    var isFailed = false
    /// What a tap on the row shows; nil for a row with nothing more to say.
    var detail: TurnStepDetail?
}

/// A step's drill-in: the command it ran, the thought it had, or what came back.
struct TurnStepDetail: Hashable, Sendable {
    let title: String
    let body: String
    var caption: String?
}

/// Steps from activity events, which everyone may read: one row per operation, opened by its
/// `started` event and closed by the matching settle. Repeats of one label fold into `×n`.
enum TurnActivitySteps {
    static func steps(_ events: [AgentActivityEvent], thought: String?) -> [TurnStep] {
        var rows: [Draft] = []
        for event in events where shows(event) {
            if event.phase == .started {
                rows.append(Draft(event: event))
            } else if let open = rows.lastIndex(where: { $0.isOpen && $0.matches(event) }) {
                rows[open].settle(event)
            } else {
                var row = Draft(event: event)
                row.settle(event)
                rows.append(row)
            }
        }
        let currentID = rows.last { $0.isOpen }?.id
        let steps = rows.map { row in
            TurnStep(
                id: row.id,
                label: row.id == currentID ? (thought ?? row.label) : row.label,
                isRunning: row.isOpen,
                isFailed: row.phase == .failed || row.phase == .interrupted
            )
        }
        return folded(steps)
    }

    /// The server's own run markers are the run, not a step of it.
    private static func shows(_ event: AgentActivityEvent) -> Bool {
        !(event.producer == .server && event.category == .working)
    }

    /// Consecutive settled rows that read the same become one row with a count.
    static func folded(_ steps: [TurnStep]) -> [TurnStep] {
        var result: [(step: TurnStep, count: Int)] = []
        for step in steps {
            if let last = result.last, !last.step.isRunning, !step.isRunning, last.step.label == step.label,
               last.step.isFailed == step.isFailed, last.step.detail == nil, step.detail == nil {
                result[result.count - 1].count += 1
            } else {
                result.append((step, 1))
            }
        }
        return result.map { entry in
            guard entry.count > 1 else { return entry.step }
            return TurnStep(id: entry.step.id, label: "\(entry.step.label) ×\(entry.count)", isRunning: false, isFailed: entry.step.isFailed)
        }
    }

    private struct Draft {
        let id: String
        let category: AgentActivityCategory
        let toolRef: String?
        let startedAt: Date
        var endedAt: Date?
        var phase: AgentActivityPhase = .started

        init(event: AgentActivityEvent) {
            id = event.id
            category = event.category
            toolRef = event.toolRef
            startedAt = event.occurredAt
        }

        var isOpen: Bool { phase == .started }

        func matches(_ event: AgentActivityEvent) -> Bool {
            if let toolRef, let other = event.toolRef { return toolRef == other }
            return category == event.category
        }

        mutating func settle(_ event: AgentActivityEvent) {
            phase = event.phase
            endedAt = event.occurredAt
        }

        var label: String {
            let words = category.stepLabel
            guard !isOpen else { return words.present }
            if phase == .interrupted { return "Stopped \(words.present.lowercased())" }
            if category == .thinking, let endedAt {
                return "Thought for \(TraceDuration.elapsed(from: startedAt, to: endedAt))"
            }
            return words.past
        }
    }
}

extension AgentActivityCategory {
    var stepLabel: TraceLabel {
        switch self {
        case .startingWork: TraceLabel("Started work", "Starting work")
        case .checkingMessages: TraceLabel("Checked messages", "Checking messages")
        case .receivedMessage: TraceLabel("Received a message", "Receiving a message")
        case .thinking: TraceLabel("Thought", "Thinking")
        case .updatingInstructions: TraceLabel("Updated instructions", "Updating instructions")
        case .browsing: TraceLabel("Browsed the web", "Browsing the web")
        case .searchingWeb: TraceLabel("Searched the web", "Searching the web")
        case .readingFiles: TraceLabel("Read files", "Reading files")
        case .editingFiles: TraceLabel("Edited files", "Editing files")
        case .runningCommand: TraceLabel("Ran a command", "Running a command")
        case .usingTool: TraceLabel("Used a tool", "Using a tool")
        case .delegating: TraceLabel("Ran a sub-agent", "Running a sub-agent")
        case .sendingMessage: TraceLabel("Sent a message", "Sending a message")
        case .working, .unknown: TraceLabel("Worked", "Working")
        }
    }
}
