import Foundation
import HausModels

/// A Task reference's id, read from its wire form `task://<taskId>` — the shared
/// contract's `parseTaskReferenceTarget`.
public struct TaskReferenceTarget: Hashable, Sendable {
    public let taskID: String

    public init(taskID: String) {
        self.taskID = taskID
    }

    /// Reads a tapped link back into a Task, for the text view's coordinator.
    public init?(url: URL) {
        let prefix = "task://"
        let target = url.absoluteString
        guard target.hasPrefix(prefix) else { return nil }
        let raw = String(target.dropFirst(prefix.count))
        let taskID = raw.removingPercentEncoding ?? raw
        guard !taskID.isEmpty else { return nil }
        self.init(taskID: taskID)
    }

    /// The in-app address a chip carries as its link.
    public var url: URL? {
        taskID.addingPercentEncoding(withAllowedCharacters: .urlHostAllowed)
            .flatMap { URL(string: "task://\($0)") }
    }
}

/// Turns the bare keys a Message's `taskLinks` resolved into chips.
///
/// A written `[SEC-12](task://id)` is already a reference by the time this
/// runs. A bare `SEC-12` is not: the Server records it without rewriting the
/// content, so the parser sees words. Working on the parsed runs rather than
/// the Markdown gets the Server's exclusions for free — a code span, a code
/// block, a Markdown link, and an autolinked URL never reach here as plain
/// prose — and a key is chipped only if the Server resolved it, so `UTF-8` in a
/// sentence stays text.
///
/// The chip reads the Task's current key, because a re-keyed board re-keys its
/// Tasks while the Message keeps the words it was written with.
public enum TaskLinkChips {
    public static func apply(_ links: [TaskLink], to blocks: [RichMessageBlock]) -> [RichMessageBlock] {
        let byText = Dictionary(
            links.map { ($0.text, $0) },
            uniquingKeysWith: { first, _ in first }
        )
        guard !byText.isEmpty else { return blocks }
        return blocks.map { chipped($0, byText: byText) }
    }

    private static func chipped(_ block: RichMessageBlock, byText: [String: TaskLink]) -> RichMessageBlock {
        switch block {
        case .paragraph(let segments):
            .paragraph(chipped(segments, byText: byText))
        case .heading(let level, let segments):
            .heading(level: level, chipped(segments, byText: byText))
        case .list(let items):
            .list(items.map { chipped($0, byText: byText) })
        case .quote(let blocks):
            .quote(blocks.map { chipped($0, byText: byText) })
        case .table(let table):
            .table(RichMessageTable(
                header: table.header.map { chipped($0, byText: byText) },
                alignments: table.alignments,
                rows: table.rows.map { row in row.map { chipped($0, byText: byText) } }
            ))
        case .code, .rule:
            block
        }
    }

    private static func chipped(_ item: RichMessageListItem, byText: [String: TaskLink]) -> RichMessageListItem {
        RichMessageListItem(
            depth: item.depth,
            marker: item.marker,
            segments: chipped(item.segments, byText: byText)
        )
    }

    private static func chipped(_ segments: [RichMessageSegment], byText: [String: TaskLink]) -> [RichMessageSegment] {
        segments.flatMap { segment -> [RichMessageSegment] in
            guard case .text(let run, let style) = segment, !style.contains(.code) else { return [segment] }
            return chipped(run, style: style, byText: byText)
        }
    }

    private static func chipped(
        _ run: String,
        style: RichInlineStyle,
        byText: [String: TaskLink]
    ) -> [RichMessageSegment] {
        var segments: [RichMessageSegment] = []
        var cursor = run.startIndex
        // The Server's own key grammar (`tasks/task-reference-scan.ts`).
        for match in run.matches(of: /[A-Z][A-Z0-9]{1,4}-[1-9][0-9]*/) {
            let range = match.range
            guard let link = byText[String(run[range])],
                  isBoundary(before: range.lowerBound, in: run),
                  isBoundary(after: range.upperBound, in: run)
            else { continue }
            if cursor < range.lowerBound {
                segments.append(.text(String(run[cursor..<range.lowerBound]), style: style))
            }
            segments.append(.reference(RichReferencePresentation(
                id: link.taskID,
                kind: .task,
                label: link.key,
                avatarURL: nil
            )))
            cursor = range.upperBound
        }
        guard !segments.isEmpty else { return [.text(run, style: style)] }
        if cursor < run.endIndex {
            segments.append(.text(String(run[cursor...]), style: style))
        }
        return segments
    }

    private static func isBoundary(before index: String.Index, in run: String) -> Bool {
        index == run.startIndex || isBoundary(run[run.index(before: index)])
    }

    private static func isBoundary(after index: String.Index, in run: String) -> Bool {
        index == run.endIndex || isBoundary(run[index])
    }

    private static func isBoundary(_ character: Character) -> Bool {
        !(character == "-" || character == "_" || character == "/"
            || (character.isASCII && (character.isLetter || character.isNumber)))
    }
}
