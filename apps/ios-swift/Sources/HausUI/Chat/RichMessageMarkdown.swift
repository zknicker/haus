import Foundation

/// The marks a run of message text can wear. They compose — `**a _b_**` is one
/// bold run around a bold-italic one — which is why this is a set rather than a
/// kind.
///
/// `code` is the exception that does not compose in practice: the App keeps
/// everything inside backticks literal, so a code span never carries emphasis
/// from markup found inside it.
public struct RichInlineStyle: OptionSet, Hashable, Sendable {
    public let rawValue: Int

    public init(rawValue: Int) { self.rawValue = rawValue }

    public static let bold = RichInlineStyle(rawValue: 1 << 0)
    public static let italic = RichInlineStyle(rawValue: 1 << 1)
    public static let strikethrough = RichInlineStyle(rawValue: 1 << 2)
    public static let code = RichInlineStyle(rawValue: 1 << 3)
}

/// How a GFM table column sets its cells, from the delimiter row's colons.
public enum RichMessageTableAlignment: Hashable, Sendable {
    case leading
    case center
    case trailing
}

/// One row of a list, flattened. Nesting is a depth rather than a tree: the
/// transcript draws a nested item as an indented row with its own marker, and
/// nothing about that drawing needs the parent item as an object.
public struct RichMessageListItem: Hashable, Sendable {
    /// What stands before the words: a bullet, or the number the author wrote.
    public enum Marker: Hashable, Sendable {
        case bullet
        case ordered(Int)
    }

    public let depth: Int
    public let marker: Marker
    public let segments: [RichMessageSegment]

    public init(depth: Int, marker: Marker, segments: [RichMessageSegment]) {
        self.depth = depth
        self.marker = marker
        self.segments = segments
    }
}

/// A GFM pipe table: a header row, the alignment its delimiter row declares,
/// and the body rows that have arrived. Every row carries exactly as many cells
/// as the header, padded or truncated the way GFM does.
public struct RichMessageTable: Hashable, Sendable {
    public let header: [[RichMessageSegment]]
    public let alignments: [RichMessageTableAlignment]
    public let rows: [[[RichMessageSegment]]]

    public init(
        header: [[RichMessageSegment]],
        alignments: [RichMessageTableAlignment],
        rows: [[[RichMessageSegment]]]
    ) {
        self.header = header
        self.alignments = alignments
        self.rows = rows
    }

    public var columnCount: Int { header.count }
}

/// One block of a message body.
///
/// The App renders a settled reply as full GFM, so the phone reads the same
/// block grammar: prose, headings, lists, quotes, fenced code, rules, and pipe
/// tables. Everything inside a block is still the inline run this client has
/// always drawn — words, reference chips, and links — only now carrying the
/// marks the author wrote.
public indirect enum RichMessageBlock: Hashable, Sendable {
    case paragraph([RichMessageSegment])
    /// Levels 1-6 as written. The transcript sets them all near body size —
    /// a heading in a chat message is a section label, not a title.
    case heading(level: Int, [RichMessageSegment])
    case list([RichMessageListItem])
    case quote([RichMessageBlock])
    /// A fenced code block. An unterminated fence runs to the end of the
    /// message, which is what a fence mid-stream is.
    case code(language: String?, text: String)
    case rule
    case table(RichMessageTable)
}

extension RichMessageBlock {
    /// Every inline run this block holds, including the ones inside its rows
    /// and cells. The avatars a body has to load are read from here.
    public var segments: [RichMessageSegment] {
        switch self {
        case .paragraph(let segments), .heading(_, let segments):
            return segments
        case .list(let items):
            return items.flatMap(\.segments)
        case .quote(let blocks):
            return blocks.flatMap(\.segments)
        case .code, .rule:
            return []
        case .table(let table):
            return (table.header + table.rows.flatMap { $0 }).flatMap { $0 }
        }
    }
}
