import Foundation
import HausModels

/// Steps from an execution journal, which Owners and Admins may read: each top-level call and
/// thought in start order, named by the ported trace labels. Consecutive settled calls of one kind
/// fold into a count (`Read 3 files`).
enum TurnJournalSteps {
    static func steps(_ journal: AgentExecutionJournal) -> [TurnStep] {
        let tools = journal.tools.filter { $0.parentToolCallID == nil }.map(Entry.init(tool:))
        let thoughts = (journal.reasoning ?? []).map(Entry.init(reasoning:))
        let entries = (tools + thoughts).sorted { $0.startedAt < $1.startedAt }
        return fold(entries)
    }

    /// Outline steps, for a settled turn: top-level steps with their stored labels.
    static func steps(_ outline: AgentExecutionOutline) -> [TurnStep] {
        let steps = outline.steps
            .filter { $0.depth == 0 && $0.kind != .bookkeeping }
            .map { step in
                TurnStep(
                    id: step.id,
                    label: step.kind == .reasoning
                        ? "Thought for \(TraceDuration.seconds((step.durationMs ?? 0) / 1_000))"
                        : step.label,
                    isRunning: step.status == .running,
                    isFailed: step.status == .failed || step.status == .interrupted
                )
            }
        return TurnActivitySteps.folded(steps)
    }

    private static func fold(_ entries: [Entry]) -> [TurnStep] {
        var steps: [TurnStep] = []
        var run: [Entry] = []
        func flush() {
            guard let first = run.first else { return }
            if run.count == 1 {
                steps.append(first.step)
            } else {
                let members = run.map { TraceFoldMember(label: $0.label, path: $0.path) }
                let label = TraceFoldLabel.label(first.kind ?? .generic, members: members)
                steps.append(TurnStep(id: first.id, label: label.past, isRunning: false, isFailed: run.contains(where: \.isFailed)))
            }
            run = []
        }
        for entry in entries {
            if entry.folds, let last = run.last, last.kind == entry.kind {
                run.append(entry)
                continue
            }
            flush()
            if entry.folds { run.append(entry) } else { steps.append(entry.step) }
        }
        flush()
        return steps
    }

    private struct Entry {
        let id: String
        let startedAt: Date
        let kind: ExecutionToolKind?
        let label: TraceLabel
        let path: String?
        let isRunning: Bool
        let isFailed: Bool
        let detail: TurnStepDetail?

        init(tool: ExecutionJournalTool) {
            let fields = TraceToolFields(input: tool.input)
            let label = tool.subagent.map { TraceLabel.verb("Ran", "Running", $0.label) }
                ?? TraceToolLabel.label(toolName: tool.toolName, input: tool.input)
            id = tool.toolCallID
            startedAt = tool.startedAt
            kind = tool.subagent == nil ? TraceToolLabel.kind(tool.toolName) : .subagent
            self.label = label
            path = fields.path
            isRunning = tool.status == .running
            isFailed = tool.status == .failed || tool.status == .interrupted
            let body = fields.command ?? fields.path.map { TracePath($0).path } ?? Self.text(tool.finalResult?.output ?? tool.output)
            detail = body.map { body in
                TurnStepDetail(
                    title: label.past,
                    body: body,
                    caption: fields.command.flatMap { ShellLabel.read($0).detail } ?? tool.failure?.message
                )
            }
        }

        init(reasoning: ExecutionJournalReasoning) {
            let label = reasoning.endedAt.map { "Thought for \(TraceDuration.elapsed(from: reasoning.startedAt, to: $0))" }
            id = reasoning.id
            startedAt = reasoning.startedAt
            kind = nil
            self.label = TraceLabel(label ?? "Thought", "Thinking")
            path = nil
            isRunning = reasoning.endedAt == nil
            isFailed = false
            let text = reasoning.text.traceTrimmed
            detail = text.isEmpty ? nil : TurnStepDetail(title: label ?? "Thinking", body: text)
        }

        /// Settled calls of a foldable kind fold; a thought, a sub-agent, and a live call never do.
        var folds: Bool {
            guard let kind, !isRunning, kind != .subagent else { return false }
            return true
        }

        var step: TurnStep {
            TurnStep(id: id, label: label[isRunning ? .present : .past], isRunning: isRunning, isFailed: isFailed, detail: detail)
        }

        private static func text(_ value: JSONValue?) -> String? {
            guard case .string(let text) = value, !text.traceTrimmed.isEmpty else { return nil }
            return text
        }
    }
}
