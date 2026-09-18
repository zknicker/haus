import Foundation

/// The line grammar behind `RichMessageBlockParser`: what a single line of a
/// message body is, before anything has decided which block it belongs to.
///
/// Each reader answers about one line, so the assembler can stay a walk over
/// lines. The one exception is a table, whose header line is only a header
/// because of the line after it — `RichMessageTableParser` owns that pair.
extension RichMessageBlockParser {
    /// Whether a line opens a block of its own, which is what ends the
    /// paragraph above it without a blank line between them.
    static func startsBlock(lines: [Substring], at index: Int) -> Bool {
        let line = lines[index]
        guard mayOpenBlock(line) else { return false }
        return CodeFence(opening: line) != nil
            || isThematicBreak(line)
            || heading(line) != nil
            || isQuote(line)
            || listItem(line) != nil
            || RichMessageTableParser.startsTable(lines: lines, at: index)
    }

    /// Whether a line could open a block at all. This whole parse re-runs on
    /// every streamed chunk, and a line of ordinary prose would otherwise pay
    /// six regexes to be told what its first character already says. Every
    /// block opener begins with one of these, and a table's header row is the
    /// one that need not — it is found by its pipes instead.
    static func mayOpenBlock(_ line: Substring) -> Bool {
        guard let first = line.first else { return false }
        return openerCharacters.contains(first) || line.contains("|")
    }

    static func heading(_ line: Substring) -> (level: Int, text: String)? {
        guard let match = firstMatch(headingExpression, in: line),
              let hashes = capture(match, at: 1, in: line),
              let text = capture(match, at: 2, in: line)
        else { return nil }
        return (level: hashes.count, text: text)
    }

    static func isQuote(_ line: Substring) -> Bool {
        firstMatch(quoteExpression, in: line) != nil
    }

    static func stripQuoteMarker(_ line: Substring) -> String {
        guard let match = firstMatch(quoteExpression, in: line) else { return String(line) }
        return (line as NSString).substring(from: match.range.length)
    }

    static func listItem(
        _ line: Substring
    ) -> (indent: Int, marker: RichMessageListItem.Marker, text: String)? {
        guard let match = firstMatch(listExpression, in: line),
              let indent = capture(match, at: 1, in: line),
              let bullet = capture(match, at: 2, in: line),
              let text = capture(match, at: 3, in: line)
        else { return nil }
        let marker: RichMessageListItem.Marker = Int(bullet.dropLast()).map { .ordered($0) } ?? .bullet
        return (indent: column(of: indent), marker: marker, text: text)
    }

    static func isThematicBreak(_ line: Substring) -> Bool {
        firstMatch(ruleExpression, in: line) != nil
    }

    /// One fence's opening: which character runs it, how long the run is, and
    /// the language its info string names.
    struct CodeFence {
        let character: Character
        let length: Int
        let language: String?

        init?(opening line: Substring) {
            guard let match = RichMessageBlockParser.firstMatch(fenceExpression, in: line),
                  let run = RichMessageBlockParser.capture(match, at: 1, in: line),
                  let character = run.first
            else { return nil }
            self.character = character
            length = run.count
            let info = (RichMessageBlockParser.capture(match, at: 2, in: line) ?? "")
                .trimmingCharacters(in: .whitespaces)
            language = info.isEmpty ? nil : info
        }

        func closes(_ line: Substring) -> Bool {
            let trimmed = line.trimmingCharacters(in: .whitespaces)
            return trimmed.count >= length && trimmed.allSatisfy { $0 == character }
        }
    }

    /// A tab advances to the next four-column stop, which is how a tab-indented
    /// nested item lines up with a space-indented one.
    private static func column(of indent: String) -> Int {
        indent.reduce(0) { column, character in
            character == "\t" ? column + 4 - column % 4 : column + 1
        }
    }

    static func firstMatch(
        _ expression: NSRegularExpression?,
        in line: Substring
    ) -> NSTextCheckingResult? {
        guard let expression else { return nil }
        let source = String(line)
        return expression.firstMatch(in: source, range: NSRange(source.startIndex..., in: source))
    }

    static func capture(
        _ match: NSTextCheckingResult,
        at index: Int,
        in line: Substring
    ) -> String? {
        let range = match.range(at: index)
        guard range.location != NSNotFound else { return nil }
        return (line as NSString).substring(with: range)
    }

    private static let openerCharacters: Set<Character> = [
        " ", "\t", "`", "~", "*", "-", "_", "#", ">", "+",
        "0", "1", "2", "3", "4", "5", "6", "7", "8", "9",
    ]
}

private let fenceExpression = try? NSRegularExpression(
    pattern: #"^ {0,3}(`{3,}|~{3,})[ \t]*([^`]*)$"#
)
private let ruleExpression = try? NSRegularExpression(
    pattern: #"^ {0,3}(?:\*[ \t]*){3,}$|^ {0,3}(?:-[ \t]*){3,}$|^ {0,3}(?:_[ \t]*){3,}$"#
)
private let headingExpression = try? NSRegularExpression(
    pattern: #"^ {0,3}(#{1,6})[ \t]+(.*?)[ \t]*#*[ \t]*$"#
)
private let quoteExpression = try? NSRegularExpression(
    pattern: #"^ {0,3}> ?"#
)
private let listExpression = try? NSRegularExpression(
    pattern: #"^([ \t]*)([-*+]|\d{1,9}[.)])[ \t]+(.*)$"#
)
