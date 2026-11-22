import Foundation

/// One tool step a Worker turn took, as its carrier summarizes it
/// (`packages/haus-api/src/worker-steps.ts`): a repo path for read and edit,
/// the command line for run, the query for search.
public struct WorkerStepEntry: Hashable, Sendable {
    public enum Kind: String, Hashable, Sendable { case read, edit, run, search }
    public enum State: String, Hashable, Sendable { case running, done, failed }

    public let kind: Kind
    public let label: String
    public let state: State
    public let additions: Int?
    public let deletions: Int?
    public let output: String?

    public init(
        kind: Kind,
        label: String,
        state: State = .done,
        additions: Int? = nil,
        deletions: Int? = nil,
        output: String? = nil
    ) {
        self.kind = kind
        self.label = label
        self.state = state
        self.additions = additions
        self.deletions = deletions
        self.output = output
    }
}

/// A run of same-kind steps folded into one line of the chain: "Read 6 files",
/// "Edited HausRouter.swift", or the live turn's current step, "Editing HausRouter.swift".
public struct WorkerStepGroup: Hashable, Sendable, Identifiable {
    public let id: Int
    public let kind: WorkerStepEntry.Kind
    public let steps: [WorkerStepEntry]
    /// The live turn's newest running step: drawn bright, never folded.
    public let isCurrent: Bool

    public var verb: String { isCurrent ? Self.presentVerb(kind) : Self.pastVerb(kind) }

    /// What the verb acts on: one subject by name, several by count.
    public var subject: String {
        let subjects = Self.distinct(steps.map(\.label))
        guard subjects.count == 1, let only = subjects.first else {
            return "\(subjects.count) \(Self.plural(kind))"
        }
        return Self.displayLabel(only, kind: kind)
    }

    public var title: String { "\(verb) \(subject)" }

    public var failed: Bool { steps.contains { $0.state == .failed } }

    static func pastVerb(_ kind: WorkerStepEntry.Kind) -> String {
        switch kind {
        case .read: "Read"
        case .edit: "Edited"
        case .run: "Ran"
        case .search: "Searched"
        }
    }

    static func presentVerb(_ kind: WorkerStepEntry.Kind) -> String {
        switch kind {
        case .read: "Reading"
        case .edit: "Editing"
        case .run: "Running"
        case .search: "Searching"
        }
    }

    static func plural(_ kind: WorkerStepEntry.Kind) -> String {
        switch kind {
        case .read, .edit: "files"
        case .run: "commands"
        case .search: "queries"
        }
    }

    static func displayLabel(_ label: String, kind: WorkerStepEntry.Kind) -> String {
        switch kind {
        case .read, .edit:
            label.split(separator: "/").last.map(String.init) ?? label
        case .run, .search:
            label
        }
    }

    private static func distinct(_ labels: [String]) -> [String] {
        var seen = Set<String>()
        return labels.filter { seen.insert($0).inserted }
    }
}

public enum WorkerStepFold {
    /// Folds a turn's steps, in the order they ran, into the chain's lines.
    /// Consecutive steps of one kind share a line. On a live turn the newest
    /// running step stands alone as the current step.
    public static func groups(_ steps: [WorkerStepEntry], live: Bool) -> [WorkerStepGroup] {
        let currentIndex = live ? steps.lastIndex { $0.state == .running } : nil
        var groups: [WorkerStepGroup] = []
        var pending: [WorkerStepEntry] = []

        func flush() {
            guard let kind = pending.first?.kind else { return }
            groups.append(WorkerStepGroup(id: groups.count, kind: kind, steps: pending, isCurrent: false))
            pending = []
        }

        for (index, step) in steps.enumerated() {
            if index == currentIndex {
                flush()
                groups.append(WorkerStepGroup(id: groups.count, kind: step.kind, steps: [step], isCurrent: true))
            } else {
                if let kind = pending.first?.kind, kind != step.kind { flush() }
                pending.append(step)
            }
        }
        flush()
        return groups
    }
}
