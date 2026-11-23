import Foundation

/// Where a long block folds. Ported from the App's `turn-trace-fold.ts`.
struct TraceLineFold: Equatable, Sendable {
    /// Lines a folded block shows.
    static let shownLines = 8
    /// A block folds only when it hides a real stretch.
    static let threshold = 11

    /// The lines a folded block shows, without a trailing newline.
    let head: String
    let hiddenLines: Int

    /// The fold for `text`, or nil when it is short enough to show whole.
    init?(_ text: String) {
        let lines = Self.countLines(text)
        guard lines >= Self.threshold else { return nil }
        head = text.traceLines.prefix(Self.shownLines).joined(separator: "\n")
        hiddenLines = lines - Self.shownLines
    }

    /// The fold control's words: what pressing it does.
    static func control(hiddenLines: Int?, isExpanded: Bool) -> String {
        if isExpanded { return "Show less" }
        guard let hiddenLines else { return "Show more" }
        return "Show \(hiddenLines.formatted()) more \(hiddenLines == 1 ? "line" : "lines")"
    }

    static func countLines(_ content: String) -> Int {
        let lines = content.traceLines.count
        return content.hasSuffix("\n") ? lines - 1 : lines
    }
}
