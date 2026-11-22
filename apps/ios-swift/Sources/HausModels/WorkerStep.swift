import Foundation

/// One tool step a Worker turn took, as its carrier summarizes it
/// (`workerStepSchema`). `label` is a repo path for `read` and `edit`, the
/// command line for `run`, and the query for `search`. Line counts ride only
/// `edit`; `output` is the redacted tail of a `run` step's terminal output.
public struct WorkerStep: Codable, Hashable, Sendable {
    public enum Kind: String, Codable, CaseIterable, Hashable, Sendable { case read, edit, run, search }
    public enum State: String, Codable, CaseIterable, Hashable, Sendable { case running, done, failed }

    public let additions: Int?
    public let deletions: Int?
    public let kind: Kind
    public let label: String
    public let output: String?
    public let state: State

    public init(
        kind: Kind,
        label: String,
        state: State,
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

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        kind = try container.decode(Kind.self, forKey: .kind)
        state = try container.decode(State.self, forKey: .state)
        label = try container.decode(String.self, forKey: .label)
        additions = try container.decode(Int?.self, forKey: .additions)
        deletions = try container.decode(Int?.self, forKey: .deletions)
        output = try container.decode(String?.self, forKey: .output)
        guard !label.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            throw DecodingError.dataCorruptedError(forKey: .label, in: container, debugDescription: "A step names its subject.")
        }
        guard (additions ?? 0) >= 0, (deletions ?? 0) >= 0 else {
            throw DecodingError.dataCorruptedError(forKey: .additions, in: container, debugDescription: "Line counts are nonnegative.")
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(kind, forKey: .kind)
        try container.encode(state, forKey: .state)
        try container.encode(label, forKey: .label)
        try container.encode(additions, forKey: .additions)
        try container.encode(deletions, forKey: .deletions)
        try container.encode(output, forKey: .output)
    }

    private enum CodingKeys: String, CodingKey {
        case additions, deletions, kind, label, output, state
    }
}
