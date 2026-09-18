import Foundation

/// A message body read as blocks: the block half of the Markdown the App
/// renders for a settled reply.
///
/// It is a line scanner rather than a grammar, and deliberately so. A reply
/// arrives a chunk at a time, this runs again on every chunk, and the answer
/// has to be stable as text grows: an unterminated fence is a code block to the
/// end of what has arrived, and a table's header stays a paragraph until its
/// delimiter row lands. Inline content inside a block is still
/// `RichMessageParser`'s, so chips, links, and autolinks work everywhere.
public enum RichMessageBlockParser {
    public static func blocks(
        _ content: String,
        resolve: (MentionPresentationKind, String, String) -> RichReferencePresentation?
    ) -> [RichMessageBlock] {
        let lines = content.split(separator: "\n", omittingEmptySubsequences: false)
        var blocks: [RichMessageBlock] = []
        var index = 0

        while index < lines.count {
            let line = lines[index]
            if line.trimmingCharacters(in: .whitespaces).isEmpty {
                index += 1
            } else if !mayOpenBlock(line) {
                blocks.append(paragraph(lines: lines, from: &index, resolve: resolve))
            } else if let fence = CodeFence(opening: line) {
                blocks.append(codeBlock(fence, lines: lines, from: &index))
            } else if isThematicBreak(line) {
                blocks.append(.rule)
                index += 1
            } else if let heading = heading(line) {
                blocks.append(
                    .heading(level: heading.level, RichMessageParser.parse(heading.text, resolve: resolve))
                )
                index += 1
            } else if isQuote(line) {
                blocks.append(quote(lines: lines, from: &index, resolve: resolve))
            } else if RichMessageTableParser.startsTable(lines: lines, at: index) {
                blocks.append(
                    .table(RichMessageTableParser.table(lines: lines, from: &index, resolve: resolve))
                )
            } else if listItem(line) != nil {
                blocks.append(list(lines: lines, from: &index, resolve: resolve))
            } else {
                blocks.append(paragraph(lines: lines, from: &index, resolve: resolve))
            }
        }

        return blocks
    }

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
    private static func mayOpenBlock(_ line: Substring) -> Bool {
        guard let first = line.first else { return false }
        return openerCharacters.contains(first) || line.contains("|")
    }

    private static let openerCharacters: Set<Character> = [
        " ", "\t", "`", "~", "*", "-", "_", "#", ">", "+",
        "0", "1", "2", "3", "4", "5", "6", "7", "8", "9",
    ]

    // MARK: - Paragraph

    private static func paragraph(
        lines: [Substring],
        from index: inout Int,
        resolve: (MentionPresentationKind, String, String) -> RichReferencePresentation?
    ) -> RichMessageBlock {
        var body: [Substring] = []
        while index < lines.count {
            let line = lines[index]
            if line.trimmingCharacters(in: .whitespaces).isEmpty { break }
            if !body.isEmpty, startsBlock(lines: lines, at: index) { break }
            body.append(line)
            index += 1
        }
        // A single newline is a line break on both clients — the App renders
        // message Markdown with `remark-breaks` — so the run keeps it.
        return .paragraph(RichMessageParser.parse(body.joined(separator: "\n"), resolve: resolve))
    }

    // MARK: - Heading

    private static func heading(_ line: Substring) -> (level: Int, text: String)? {
        guard let match = firstMatch(headingExpression, in: line),
              let hashes = capture(match, at: 1, in: line),
              let text = capture(match, at: 2, in: line)
        else { return nil }
        return (level: hashes.count, text: text)
    }

    // MARK: - Quote

    private static func isQuote(_ line: Substring) -> Bool {
        firstMatch(quoteExpression, in: line) != nil
    }

    private static func quote(
        lines: [Substring],
        from index: inout Int,
        resolve: (MentionPresentationKind, String, String) -> RichReferencePresentation?
    ) -> RichMessageBlock {
        var body: [String] = []
        while index < lines.count, isQuote(lines[index]) {
            body.append(stripQuoteMarker(lines[index]))
            index += 1
        }
        return .quote(blocks(body.joined(separator: "\n"), resolve: resolve))
    }

    private static func stripQuoteMarker(_ line: Substring) -> String {
        guard let match = firstMatch(quoteExpression, in: line) else { return String(line) }
        let source = line as NSString
        return source.substring(from: match.range.length)
    }

    // MARK: - List

    private static func listItem(_ line: Substring) -> (indent: Int, marker: RichMessageListItem.Marker, text: String)? {
        guard let match = firstMatch(listExpression, in: line),
              let indent = capture(match, at: 1, in: line),
              let bullet = capture(match, at: 2, in: line),
              let text = capture(match, at: 3, in: line)
        else { return nil }
        let marker: RichMessageListItem.Marker = Int(bullet.dropLast()).map { .ordered($0) } ?? .bullet
        return (indent: column(of: indent), marker: marker, text: text)
    }

    private static func list(
        lines: [Substring],
        from index: inout Int,
        resolve: (MentionPresentationKind, String, String) -> RichReferencePresentation?
    ) -> RichMessageBlock {
        var items: [RichMessageListItem] = []
        // Indent columns, outermost first. An item deeper than the current top
        // opens a level; one shallower closes back to the nearest that holds it.
        var levels: [Int] = []

        while index < lines.count {
            let line = lines[index]
            if line.trimmingCharacters(in: .whitespaces).isEmpty {
                // A blank line inside a list is spacing between items, not the
                // end of the list — but only if another item follows.
                guard index + 1 < lines.count, listItem(lines[index + 1]) != nil else { break }
                index += 1
                continue
            }
            guard let item = listItem(line) else { break }
            index += 1

            while let top = levels.last, item.indent < top { levels.removeLast() }
            if levels.isEmpty || item.indent > levels[levels.count - 1] {
                levels.append(item.indent)
            }

            items.append(
                RichMessageListItem(
                    depth: levels.count - 1,
                    marker: item.marker,
                    segments: RichMessageParser.parse(
                        continuedText(item.text, lines: lines, from: &index),
                        resolve: resolve
                    )
                )
            )
        }

        return .list(items)
    }

    /// An item's own words, plus the wrapped lines that belong to it: a
    /// non-blank line that opens no block of its own is a continuation of the
    /// item above, the way it is on the web.
    private static func continuedText(
        _ text: String,
        lines: [Substring],
        from index: inout Int
    ) -> String {
        var body = text
        while index < lines.count,
              !lines[index].trimmingCharacters(in: .whitespaces).isEmpty,
              !startsBlock(lines: lines, at: index) {
            body += " " + lines[index].trimmingCharacters(in: .whitespaces)
            index += 1
        }
        return body
    }

    // MARK: - Code

    /// One fence's opening: which character runs it, how long the run is, and
    /// the language its info string names.
    private struct CodeFence {
        let character: Character
        let length: Int
        let language: String?

        init?(opening line: Substring) {
            guard let match = firstMatch(fenceExpression, in: line),
                  let run = capture(match, at: 1, in: line),
                  let character = run.first
            else { return nil }
            self.character = character
            length = run.count
            let info = (capture(match, at: 2, in: line) ?? "")
                .trimmingCharacters(in: .whitespaces)
            language = info.isEmpty ? nil : info
        }

        func closes(_ line: Substring) -> Bool {
            let trimmed = line.trimmingCharacters(in: .whitespaces)
            guard trimmed.count >= length, trimmed.allSatisfy({ $0 == character }) else {
                return false
            }
            return true
        }
    }

    private static func codeBlock(
        _ fence: CodeFence,
        lines: [Substring],
        from index: inout Int
    ) -> RichMessageBlock {
        index += 1
        var body: [Substring] = []
        // An unterminated fence runs to the end of what has arrived. That is
        // what a fence mid-stream is, and closing it early would reflow the
        // whole block on the next chunk.
        while index < lines.count, !fence.closes(lines[index]) {
            body.append(lines[index])
            index += 1
        }
        if index < lines.count { index += 1 }
        return .code(language: fence.language, text: body.joined(separator: "\n"))
    }

    // MARK: - Rules

    private static func isThematicBreak(_ line: Substring) -> Bool {
        firstMatch(ruleExpression, in: line) != nil
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
        return (String(line) as NSString).substring(with: range)
    }

    private static let fenceExpression = try? NSRegularExpression(
        pattern: #"^ {0,3}(`{3,}|~{3,})[ \t]*([^`]*)$"#
    )
    private static let ruleExpression = try? NSRegularExpression(
        pattern: #"^ {0,3}(?:\*[ \t]*){3,}$|^ {0,3}(?:-[ \t]*){3,}$|^ {0,3}(?:_[ \t]*){3,}$"#
    )
    private static let headingExpression = try? NSRegularExpression(
        pattern: #"^ {0,3}(#{1,6})[ \t]+(.*?)[ \t]*#*[ \t]*$"#
    )
    private static let quoteExpression = try? NSRegularExpression(
        pattern: #"^ {0,3}> ?"#
    )
    private static let listExpression = try? NSRegularExpression(
        pattern: #"^([ \t]*)([-*+]|\d{1,9}[.)])[ \t]+(.*)$"#
    )
}
