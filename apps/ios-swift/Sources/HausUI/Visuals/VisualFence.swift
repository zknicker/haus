import Foundation

/// One piece of a message body: prose, or a ```visual fence.
public enum VisualFenceSegment: Sendable, Hashable {
    case text(String)
    case visual(html: String, isOpen: Bool, title: String?)
}

/// One visual fence in a message, identified by its 1-based ordinal.
public struct VisualSegment: Sendable, Hashable, Identifiable {
    public let ordinal: Int
    public let html: String
    public let isOpen: Bool
    public let title: String?

    public var id: Int { ordinal }

    public init(ordinal: Int, html: String, isOpen: Bool, title: String?) {
        self.ordinal = ordinal
        self.html = html
        self.isOpen = isOpen
        self.title = title
    }
}

/// A message body split into the prose it says and the visuals it draws.
public struct VisualMessageBody: Sendable, Hashable {
    public let prose: String
    public let visuals: [VisualSegment]

    public init(prose: String, visuals: [VisualSegment]) {
        self.prose = prose
        self.visuals = visuals
    }
}

/// The ```visual fence grammar, ported from `packages/haus-api/src/widgets/
/// visual/contracts.ts`. An optional info-string title follows the tag, then the
/// raw HTML body up to the closing fence; an unclosed fence is a mid-stream
/// visual whose body is still growing.
///
/// Where the fence sits is forgiving, because one missing newline used to turn
/// a whole answer into raw markup: the tag opens a fence at the start of a line
/// *or* glued to the end of a sentence, and the body ends at the first backtick
/// run of a body line, standing alone or glued to the markup. What a fence *is*
/// stays strict: whitespace in front of the tag means prose, a backtick in
/// front means a longer fence or inline code, the info word is exactly
/// `visual`, and a tag inside another fenced block belongs to that block.
public enum VisualFence {
    /// The web's `splitVisualFences`, segment for segment.
    ///
    /// The scan runs over Unicode scalars, not Characters: JavaScript sees CR
    /// and LF as two units, while Swift's Character view merges "\r\n" into one
    /// grapheme and would hide a CRLF line break from the scan. Every boundary
    /// this cuts on is ASCII, so the slices match the web's byte for byte.
    public static func split(_ content: String) -> [VisualFenceSegment] {
        let scalars = Array(content.unicodeScalars)
        var segments: [VisualFenceSegment] = []
        var textStart = 0
        var cursor = 0
        var enclosing: (marker: Unicode.Scalar, length: Int)?

        while cursor <= scalars.count {
            let lineEnd = lineEndIndex(scalars, from: cursor)
            // A fence only opens or closes at a true line start; after a
            // closing run the cursor sits mid-line, and the rest is prose.
            let startsLine = cursor == 0 || scalars[cursor - 1] == "\n"

            if let open = enclosing {
                if startsLine, closesFence(scalars, cursor, lineEnd, open) { enclosing = nil }
            } else if let opener = visualOpener(scalars, from: cursor, to: lineEnd) {
                if opener > textStart {
                    segments.append(.text(text(scalars, textStart, opener)))
                }
                let fence = readFence(scalars, opener: opener, openerLineEnd: lineEnd)
                segments.append(visual(title: fence.title, html: fence.html, isOpen: fence.isOpen))
                textStart = fence.end
                cursor = fence.end
                continue
            } else if startsLine, let run = fenceRun(scalars, cursor, lineEnd) {
                enclosing = (run.marker, run.length)
            }

            cursor = lineEnd + 1
        }

        if textStart < scalars.count {
            segments.append(.text(text(scalars, textStart, scalars.count)))
        }

        return segments
    }

    /// The web's transcript placement: every text segment concatenated in order
    /// and trimmed as one prose block, then the fences in order.
    public static func body(_ content: String) -> VisualMessageBody {
        var prose = ""
        var visuals: [VisualSegment] = []

        for segment in split(content) {
            switch segment {
            case let .text(text):
                prose += text
            case let .visual(html, isOpen, title):
                visuals.append(
                    VisualSegment(ordinal: visuals.count + 1, html: html, isOpen: isOpen, title: title)
                )
            }
        }

        return VisualMessageBody(
            prose: prose.trimmingCharacters(in: .whitespacesAndNewlines),
            visuals: visuals
        )
    }

    /// The tag that opens a visual: exactly three backticks and the word.
    private static let visualFenceTag = Array("```visual".unicodeScalars)

    /// The index of the first real fence opener on this line, if any.
    private static func visualOpener(_ scalars: [Unicode.Scalar], from: Int, to: Int) -> Int? {
        let tag = visualFenceTag
        var index = from

        while index + tag.count <= to {
            if (0..<tag.count).allSatisfy({ scalars[index + $0] == tag[$0] }) {
                let before: Unicode.Scalar = index == 0 ? "\n" : scalars[index - 1]
                let afterIndex = index + tag.count
                let after: Unicode.Scalar? = afterIndex < to ? scalars[afterIndex] : nil
                let opensFence = before == "\n" || !(isSpace(before) || before == "`")

                if opensFence, after.map(isSpace) ?? true {
                    return index
                }
            }

            index += 1
        }

        return nil
    }

    private struct ReadFence {
        let end: Int
        let html: String
        let isOpen: Bool
        let title: String
    }

    /// The fence starting at `opener`: its title, its body, and where the
    /// message resumes. The body ends at the first backtick run of a body line —
    /// on its own line the run drops the newline before it, glued to the markup
    /// it keeps that line — and the rest of that line is prose again.
    private static func readFence(
        _ scalars: [Unicode.Scalar],
        opener: Int,
        openerLineEnd: Int
    ) -> ReadFence {
        let title = text(scalars, opener + visualFenceTag.count, openerLineEnd)
            .trimmingCharacters(in: .whitespacesAndNewlines)

        guard openerLineEnd < scalars.count else {
            return ReadFence(end: scalars.count, html: "", isOpen: true, title: title)
        }

        let bodyStart = openerLineEnd + 1
        var lineStart = bodyStart

        while lineStart <= scalars.count {
            let lineEnd = lineEndIndex(scalars, from: lineStart)

            if let run = closingRun(scalars, lineStart, lineEnd) {
                let ownLine = (lineStart..<run.start).allSatisfy { isSpace(scalars[$0]) }
                let bodyEnd = ownLine ? max(bodyStart, lineStart - 1) : run.start

                return ReadFence(
                    end: run.end,
                    html: text(scalars, bodyStart, bodyEnd),
                    isOpen: false,
                    title: title
                )
            }

            lineStart = lineEnd + 1
        }

        return ReadFence(
            end: scalars.count,
            html: text(scalars, bodyStart, scalars.count),
            isOpen: true,
            title: title
        )
    }

    /// The terminator: the first run of three or more backticks that ends a body
    /// line or is followed by whitespace. The word boundary is what keeps a run
    /// inside markup — a visual that draws the fence syntax it is teaching —
    /// from closing the fence early.
    private static func closingRun(
        _ scalars: [Unicode.Scalar],
        _ from: Int,
        _ to: Int
    ) -> (start: Int, end: Int)? {
        var index = from

        while index < to {
            guard scalars[index] == "`" else {
                index += 1
                continue
            }

            var end = index
            while end < to, scalars[end] == "`" { end += 1 }
            if end - index >= 3, end == to || isSpace(scalars[end]) { return (index, end) }
            index = end
        }

        return nil
    }

    /// A backtick or tilde run opening or closing a fenced block of some other
    /// language: up to three spaces of indent, then three or more markers.
    private static func fenceRun(
        _ scalars: [Unicode.Scalar],
        _ from: Int,
        _ to: Int
    ) -> (marker: Unicode.Scalar, length: Int, end: Int)? {
        var index = from

        while index < to, index - from < 3, scalars[index] == " " || scalars[index] == "\t" {
            index += 1
        }

        guard index < to else { return nil }
        let marker = scalars[index]
        guard marker == "`" || marker == "~" else { return nil }

        var end = index
        while end < to, scalars[end] == marker { end += 1 }

        return end - index >= 3 ? (marker, end - index, end) : nil
    }

    private static func closesFence(
        _ scalars: [Unicode.Scalar],
        _ from: Int,
        _ to: Int,
        _ enclosing: (marker: Unicode.Scalar, length: Int)
    ) -> Bool {
        guard let run = fenceRun(scalars, from, to), run.marker == enclosing.marker,
            run.length >= enclosing.length
        else {
            return false
        }

        return (run.end..<to).allSatisfy {
            scalars[$0] == " " || scalars[$0] == "\t" || scalars[$0] == "\r"
        }
    }

    private static func lineEndIndex(_ scalars: [Unicode.Scalar], from: Int) -> Int {
        var index = from
        while index < scalars.count, scalars[index] != "\n" { index += 1 }
        return index
    }

    private static func isSpace(_ scalar: Unicode.Scalar) -> Bool {
        scalar == " " || scalar == "\t" || scalar == "\r" || scalar == "\n"
    }

    private static func text(_ scalars: [Unicode.Scalar], _ from: Int, _ to: Int) -> String {
        var view = String.UnicodeScalarView()
        view.append(contentsOf: scalars[from..<to])
        return String(view)
    }

    private static func visual(title: String, html: String, isOpen: Bool) -> VisualFenceSegment {
        let trimmed = title.trimmingCharacters(in: .whitespacesAndNewlines)
        return .visual(html: html, isOpen: isOpen, title: trimmed.isEmpty ? nil : trimmed)
    }
}
