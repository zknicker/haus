import Foundation

/// A message body read as blocks: the block half of the Markdown the App
/// renders for a settled reply.
///
/// It walks lines rather than building a tree, and deliberately so. A reply
/// arrives a chunk at a time, this runs again on every chunk, and the answer
/// has to be stable as text grows: an unterminated fence is a code block to the
/// end of what has arrived, and a table's header stays a paragraph until its
/// delimiter row lands. What each line is belongs to `RichMessageLineGrammar`;
/// what is inside a block is still `RichMessageParser`'s, so chips, links, and
/// autolinks work everywhere.
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

    // MARK: - Quote

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

    // MARK: - List

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
}
