import Foundation

/// A running call reads in the present tense; a settled one in the past.
enum TraceTense: Sendable {
    case past
    case present
}

/// A row label in both tenses, so a live row can switch without re-deriving it. Ported from the
/// App's `turn-trace-tense.ts`.
struct TraceLabel: Equatable, Hashable, Sendable {
    let past: String
    let present: String

    init(_ past: String, _ present: String) {
        self.past = past
        self.present = present
    }

    subscript(tense: TraceTense) -> String {
        tense == .past ? past : present
    }

    static func verb(_ past: String, _ present: String, _ target: String) -> TraceLabel {
        TraceLabel("\(past) \(target)", "\(present) \(target)")
    }
}
