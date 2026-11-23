import Foundation

/// An ICU pattern for the turn trace's label readers, which port the App's
/// JavaScript expressions one to one. Positions are UTF-16, as in JavaScript.
struct TraceRegex: @unchecked Sendable {
    private let expression: NSRegularExpression

    init(_ pattern: String) {
        do {
            expression = try NSRegularExpression(pattern: pattern)
        } catch {
            preconditionFailure("Invalid trace pattern \(pattern): \(error)")
        }
    }

    func contains(_ text: String) -> Bool {
        expression.firstMatch(in: text, range: Self.whole(text)) != nil
    }

    func firstMatch(in text: String) -> TraceMatch? {
        expression.firstMatch(in: text, range: Self.whole(text)).map { TraceMatch(result: $0, text: text) }
    }

    func matches(in text: String) -> [TraceMatch] {
        expression.matches(in: text, range: Self.whole(text)).map { TraceMatch(result: $0, text: text) }
    }

    /// Every match replaced; `$1` names a group, as in a JavaScript replacement.
    func replacing(in text: String, with template: String = "") -> String {
        expression.stringByReplacingMatches(in: text, range: Self.whole(text), withTemplate: template)
    }

    private static func whole(_ text: String) -> NSRange {
        NSRange(location: 0, length: (text as NSString).length)
    }
}

/// One match: its groups by number, nil where a group did not take part.
struct TraceMatch {
    let range: NSRange
    private let groups: [String?]
    let groupRanges: [NSRange]

    init(result: NSTextCheckingResult, text: String) {
        let source = text as NSString
        range = result.range
        groupRanges = (0..<result.numberOfRanges).map { result.range(at: $0) }
        groups = groupRanges.map { $0.location == NSNotFound ? nil : source.substring(with: $0) }
    }

    subscript(group: Int) -> String? {
        group < groups.count ? groups[group] : nil
    }
}

extension String {
    var traceTrimmed: String { trimmingCharacters(in: .whitespacesAndNewlines) }

    var traceTrimmedEnd: String {
        var scalars = Substring(self)
        while let last = scalars.last, last.isWhitespace { scalars.removeLast() }
        return String(scalars)
    }

    /// Splits on the newline code unit, as JavaScript's `split('\n')` does.
    var traceLines: [String] { components(separatedBy: "\n") }

    /// Splits on single spaces, as JavaScript's `split(' ')` does.
    var traceWords: [String] { components(separatedBy: " ") }
}
