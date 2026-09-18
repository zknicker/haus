import Foundation

/// The emphasis half of a message's inline Markdown: which stretches of prose
/// are bold, italic, struck, or code.
///
/// Two rules decide everything here, and both come from the App's renderer.
/// Markup inside a code span is literal, so a span is opaque to this scan — and
/// so is a Markdown link, whose target routinely carries `_` and `*` that are
/// part of an address rather than emphasis. Everything else is an ordinary
/// delimiter run, matched to the first closer that can legally close it.
enum RichMessageInlineMarkdown {
    /// One stretch of prose and the marks it wears. A run may still contain
    /// links and code spans; those are resolved by the caller, which is what
    /// keeps a chip inside `**bold**` a chip.
    struct Run {
        let text: Substring
        let style: RichInlineStyle
    }

    /// The spans this scan steps over: a code span, or a Markdown link. Both
    /// are found once per message and reused, because the emphasis scan and the
    /// reference pass both need them.
    struct Protected {
        let range: Range<String.Index>
        /// The code span's contents, or nil for a link.
        let code: Substring?
    }

    /// Every code span and Markdown link in `content`, in order and without
    /// overlap. A code span wins a tie: backticks are literal, so a link
    /// written inside them is not a link.
    static func protectedSpans(
        in content: String,
        links: [Range<String.Index>]
    ) -> [Protected] {
        var spans = codeSpans(in: content)
        for link in links where !spans.contains(where: { $0.range.overlaps(link) }) {
            spans.append(Protected(range: link, code: nil))
        }
        return spans.sorted { $0.range.lowerBound < $1.range.lowerBound }
    }

    /// `content` split into the runs its emphasis markup makes. Runs cover the
    /// whole string in order, and the delimiters themselves are dropped.
    static func runs(
        in content: String,
        protected: [Protected]
    ) -> [Run] {
        var runs: [Run] = []
        emphasize(content[...], style: [], protected: protected, into: &runs)
        return runs
    }

    // MARK: - Emphasis

    private static func emphasize(
        _ slice: Substring,
        style: RichInlineStyle,
        protected: [Protected],
        into runs: inout [Run]
    ) {
        var literalStart = slice.startIndex
        var cursor = slice.startIndex

        while cursor < slice.endIndex {
            if let span = protected.first(where: { $0.range.contains(cursor) }) {
                cursor = min(span.range.upperBound, slice.endIndex)
                continue
            }
            guard let opener = opener(at: cursor, in: slice),
                  let closer = closer(
                      for: opener,
                      after: opener.contentStart,
                      in: slice,
                      protected: protected
                  )
            else {
                cursor = slice.index(after: cursor)
                continue
            }
            append(slice[literalStart..<cursor], style: style, into: &runs)
            emphasize(
                slice[opener.contentStart..<closer.lowerBound],
                style: style.union(opener.style),
                protected: protected,
                into: &runs
            )
            cursor = closer.upperBound
            literalStart = cursor
        }

        append(slice[literalStart...], style: style, into: &runs)
    }

    private struct Opener {
        let delimiter: String
        let style: RichInlineStyle
        let contentStart: String.Index
    }

    /// The delimiter that opens at `index`, longest first, so `**` is never
    /// read as two `*`. An underscore only opens a run when it starts a word:
    /// `snake_case_name` is a name on both clients, not emphasis.
    private static func opener(at index: String.Index, in slice: Substring) -> Opener? {
        for candidate in delimiters {
            guard slice[index...].hasPrefix(candidate.text) else { continue }
            let contentStart = slice.index(index, offsetBy: candidate.text.count)
            guard contentStart < slice.endIndex else { return nil }
            guard !slice[contentStart].isWhitespace else { continue }
            if candidate.requiresWordBoundary, index > slice.startIndex {
                let before = slice[slice.index(before: index)]
                guard !before.isLetter, !before.isNumber else { continue }
            }
            return Opener(
                delimiter: candidate.text,
                style: candidate.style,
                contentStart: contentStart
            )
        }
        return nil
    }

    /// The first closer that can legally close `opener`: outside every
    /// protected span, not preceded by whitespace, and — for an underscore —
    /// not in the middle of a word.
    private static func closer(
        for opener: Opener,
        after start: String.Index,
        in slice: Substring,
        protected: [Protected]
    ) -> Range<String.Index>? {
        var cursor = start
        let requiresWordBoundary = opener.delimiter.first == "_"

        while cursor < slice.endIndex {
            if let span = protected.first(where: { $0.range.contains(cursor) }) {
                cursor = min(span.range.upperBound, slice.endIndex)
                continue
            }
            guard slice[cursor...].hasPrefix(opener.delimiter) else {
                cursor = slice.index(after: cursor)
                continue
            }
            let end = slice.index(cursor, offsetBy: opener.delimiter.count)
            let previous = slice[slice.index(before: cursor)]
            let closesAWord = !requiresWordBoundary || end == slice.endIndex
                || !(slice[end].isLetter || slice[end].isNumber)
            if cursor > start, !previous.isWhitespace, closesAWord {
                return cursor..<end
            }
            cursor = end
        }
        return nil
    }

    private static func append(
        _ text: Substring,
        style: RichInlineStyle,
        into runs: inout [Run]
    ) {
        guard !text.isEmpty else { return }
        runs.append(Run(text: text, style: style))
    }

    /// Longest first: `**`/`__` are tried before `*`/`_`, and `~~` before
    /// either, so a two-character delimiter is never read as one.
    private static let delimiters: [(text: String, style: RichInlineStyle, requiresWordBoundary: Bool)] = [
        ("~~", .strikethrough, false),
        ("**", .bold, false),
        ("__", .bold, true),
        ("*", .italic, false),
        ("_", .italic, true),
    ]

    // MARK: - Code spans

    /// Backtick spans, shortest match per opening run, the way CommonMark
    /// closes a span on a backtick run of the same length.
    private static func codeSpans(in content: String) -> [Protected] {
        guard let expression = codeSpanExpression else { return [] }
        var spans: [Protected] = []
        var cursor = content.startIndex
        for match in expression.matches(
            in: content,
            range: NSRange(content.startIndex..., in: content)
        ) {
            guard let range = Range(match.range(at: 0), in: content),
                  let inner = Range(match.range(at: 2), in: content),
                  range.lowerBound >= cursor
            else { continue }
            spans.append(Protected(range: range, code: content[inner]))
            cursor = range.upperBound
        }
        return spans
    }

    /// `[\s\S]` rather than a dot: a code span may run across a line the way it
    /// does in the App, and the pattern must not be line-bounded.
    private static let codeSpanExpression = try? NSRegularExpression(
        pattern: #"(`+)([\s\S]*?)\1"#
    )
}
