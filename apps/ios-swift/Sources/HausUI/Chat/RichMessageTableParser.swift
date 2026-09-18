import Foundation

/// The GFM pipe-table grammar.
///
/// A table is its delimiter row: until that row arrives a header line is just a
/// sentence with pipes in it, which is exactly what it should look like while a
/// reply streams. Once the delimiter lands the block becomes a table and grows
/// a row at a time.
enum RichMessageTableParser {
    /// Whether a table opens at `index`: a header row, then a delimiter row
    /// declaring the same number of columns. GFM requires the match, and
    /// requiring it here is what keeps a paragraph full of pipes a paragraph.
    static func startsTable(lines: [Substring], at index: Int) -> Bool {
        guard index + 1 < lines.count, lines[index].contains("|") else { return false }
        guard let alignments = alignments(lines[index + 1]) else { return false }
        return alignments.count == cells(lines[index]).count
    }

    /// The table opening at `index`, consuming its header, its delimiter row,
    /// and every row that follows until a blank line or another block.
    static func table(
        lines: [Substring],
        from index: inout Int,
        resolve: (MentionPresentationKind, String, String) -> RichReferencePresentation?
    ) -> RichMessageTable {
        let headerCells = cells(lines[index])
        let alignments = alignments(lines[index + 1]) ?? []
        index += 2

        var rows: [[[RichMessageSegment]]] = []
        while index < lines.count {
            let line = lines[index]
            guard !line.trimmingCharacters(in: .whitespaces).isEmpty, line.contains("|") else { break }
            rows.append(
                fitted(cells(line), to: headerCells.count).map {
                    RichMessageParser.parse($0, resolve: resolve)
                }
            )
            index += 1
        }

        return RichMessageTable(
            header: headerCells.map { RichMessageParser.parse($0, resolve: resolve) },
            alignments: alignments,
            rows: rows
        )
    }

    /// A row's cells: split on the pipes the author did not escape, with the
    /// leading and trailing pipe's empty cells dropped and `\|` read back as a
    /// literal pipe.
    static func cells(_ line: Substring) -> [String] {
        var cells: [String] = []
        var current = ""
        var escaped = false
        for character in line {
            if escaped {
                // Only the pipe is a table-level escape; every other backslash
                // pair belongs to the inline pass and is left as written.
                current += character == "|" ? "|" : "\\\(character)"
                escaped = false
            } else if character == "\\" {
                escaped = true
            } else if character == "|" {
                cells.append(current)
                current = ""
            } else {
                current.append(character)
            }
        }
        if escaped { current += "\\" }
        cells.append(current)

        if cells.first?.trimmingCharacters(in: .whitespaces).isEmpty == true { cells.removeFirst() }
        if cells.last?.trimmingCharacters(in: .whitespaces).isEmpty == true { cells.removeLast() }
        return cells.map { $0.trimmingCharacters(in: .whitespaces) }
    }

    /// The column alignments a delimiter row declares, or nil when the line is
    /// not a delimiter row at all.
    private static func alignments(_ line: Substring) -> [RichMessageTableAlignment]? {
        let columns = cells(line)
        guard !columns.isEmpty else { return nil }
        var alignments: [RichMessageTableAlignment] = []
        for column in columns {
            guard let alignment = alignment(column) else { return nil }
            alignments.append(alignment)
        }
        return alignments
    }

    private static func alignment(_ column: String) -> RichMessageTableAlignment? {
        let leading = column.hasPrefix(":")
        let trailing = column.hasSuffix(":")
        let dashes = column.dropFirst(leading ? 1 : 0).dropLast(trailing ? 1 : 0)
        guard !dashes.isEmpty, dashes.allSatisfy({ $0 == "-" }) else { return nil }
        switch (leading, trailing) {
        case (true, true): return .center
        case (false, true): return .trailing
        default: return .leading
        }
    }

    /// GFM's row shape: extra cells are dropped, missing ones are empty.
    private static func fitted(_ cells: [String], to count: Int) -> [String] {
        guard cells.count != count else { return cells }
        guard cells.count > count else {
            return cells + Array(repeating: "", count: count - cells.count)
        }
        return Array(cells.prefix(count))
    }
}
