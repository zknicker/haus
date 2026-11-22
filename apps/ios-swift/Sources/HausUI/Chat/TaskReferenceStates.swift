import Foundation
import HausModels

/// Puts each Task reference's state disc on it, from the Task states the app
/// already holds. A chip reads nothing to render, so a Task this client has no
/// read of keeps the Tasks glyph rather than fanning out one read per chip.
///
/// This runs after the parse, so a state change restamps the chips without
/// reparsing the body that carries them.
public enum TaskReferenceStates {
    /// Every Task a body references, written or chipped from a bare key.
    public static func taskIDs(in blocks: [RichMessageBlock]) -> Set<String> {
        var ids: Set<String> = []
        for block in blocks {
            visit(block) { reference in
                if reference.kind == .task { ids.insert(reference.id) }
            }
        }
        return ids
    }

    public static func apply(_ states: [String: TaskState], to blocks: [RichMessageBlock]) -> [RichMessageBlock] {
        blocks.map { stamped($0, states: states) }
    }

    private static func stamped(_ block: RichMessageBlock, states: [String: TaskState]) -> RichMessageBlock {
        switch block {
        case .paragraph(let segments):
            .paragraph(stamped(segments, states: states))
        case .heading(let level, let segments):
            .heading(level: level, stamped(segments, states: states))
        case .list(let items):
            .list(items.map {
                RichMessageListItem(depth: $0.depth, marker: $0.marker, segments: stamped($0.segments, states: states))
            })
        case .quote(let blocks):
            .quote(blocks.map { stamped($0, states: states) })
        case .table(let table):
            .table(RichMessageTable(
                header: table.header.map { stamped($0, states: states) },
                alignments: table.alignments,
                rows: table.rows.map { row in row.map { stamped($0, states: states) } }
            ))
        case .code, .rule:
            block
        }
    }

    private static func stamped(_ segments: [RichMessageSegment], states: [String: TaskState]) -> [RichMessageSegment] {
        segments.map { segment in
            guard case .reference(let reference) = segment, reference.kind == .task else { return segment }
            return .reference(reference.with(taskState: states[reference.id]))
        }
    }

    private static func visit(_ block: RichMessageBlock, _ body: (RichReferencePresentation) -> Void) {
        switch block {
        case .paragraph(let segments), .heading(_, let segments):
            visit(segments, body)
        case .list(let items):
            items.forEach { visit($0.segments, body) }
        case .quote(let blocks):
            blocks.forEach { visit($0, body) }
        case .table(let table):
            table.header.forEach { visit($0, body) }
            table.rows.forEach { row in row.forEach { visit($0, body) } }
        case .code, .rule:
            break
        }
    }

    private static func visit(_ segments: [RichMessageSegment], _ body: (RichReferencePresentation) -> Void) {
        for case .reference(let reference) in segments { body(reference) }
    }
}
