import Foundation

/// Splits a message's stored Markdown into plain text, typed references, and
/// the links this client leaves as links.
///
/// The persisted link is the source of truth: `[@Cove](agent://agt_cove)`,
/// `[@Ada](user://usr_ada)`, `[#product](chat://cht_product)`, `[$ui](skill://ui)`,
/// `[README.md](/repo/README.md)`, `[the notes](https://haus.dev)`. Every wire
/// form the App chips is read here through `RichReferenceWireForm`, in the App's
/// own precedence. A target that names none of them is still a link — the App
/// renders one as an ordinary anchor — so it reads as its own words rather than
/// as raw Markdown. `resolve` supplies the live identity, and the persisted
/// label remains the fallback for a target the app cannot currently resolve —
/// read, like a resolved one, through `ReferenceLabel`, so an unresolved chip
/// wears no sigil either.
public enum RichMessageParser {
    // Compiled once: this parser runs per message inside hot view bodies, and
    // per-call NSRegularExpression construction dominated its cost.
    private static let referenceExpression = try? NSRegularExpression(
        pattern: #"\[([^\]\n]+)\]\(([^\)\n]+)\)"#
    )

    public static func parse(
        _ content: String,
        resolve: (MentionPresentationKind, String, String) -> RichReferencePresentation?
    ) -> [RichMessageSegment] {
        guard let expression = referenceExpression else { return [.text(content)] }
        let links = markdownLinks(in: content, expression: expression)
        let protected = RichMessageInlineMarkdown.protectedSpans(
            in: content,
            links: links.map(\.range)
        )
        var segments: [RichMessageSegment] = []
        for run in RichMessageInlineMarkdown.runs(in: content, protected: protected) {
            append(
                run,
                links: links,
                protected: protected,
                in: content,
                resolve: resolve,
                into: &segments
            )
        }
        return segments.isEmpty ? [.text(content)] : segments
    }

    /// One emphasis run, with the spans emphasis had to step over put back:
    /// a code span as its literal contents, a Markdown link as the chip or
    /// anchor it names, and the prose between them autolinked as ever. The
    /// run's marks ride along, so a chip inside `**bold**` is still a chip and
    /// the words around it are still bold.
    private static func append(
        _ run: RichMessageInlineMarkdown.Run,
        links: [MarkdownLink],
        protected: [RichMessageInlineMarkdown.Protected],
        in content: String,
        resolve: (MentionPresentationKind, String, String) -> RichReferencePresentation?,
        into segments: inout [RichMessageSegment]
    ) {
        var cursor = run.text.startIndex
        for span in protected
        where span.range.lowerBound >= cursor && span.range.upperBound <= run.text.endIndex {
            appendAutolinked(run.text[cursor..<span.range.lowerBound], style: run.style, into: &segments)
            if let code = span.code {
                append(text: code, style: run.style.union(.code), into: &segments)
            } else if let link = links.first(where: { $0.range == span.range }) {
                append(link, in: content, style: run.style, resolve: resolve, into: &segments)
            }
            cursor = span.range.upperBound
        }
        appendAutolinked(run.text[cursor...], style: run.style, into: &segments)
    }

    /// A one-line preview of a message: every visual fence reads as the visual's
    /// name, every Markdown link reads as the words a person sees on the chip —
    /// a typed reference through `ReferenceLabel`, so a preview says `Product`
    /// and `Agent Browser` rather than `#product` and `$agent-browser`, and an
    /// ordinary web link as its own link text. Each run of whitespace becomes a
    /// single space.
    public static func oneLinePreview(_ content: String) -> String {
        let named = VisualFence.previewText(content)
        let unlinked = linkExpression.map { previewText(named, expression: $0) } ?? named
        return unlinked.split(whereSeparator: { $0.isWhitespace }).joined(separator: " ")
    }

    private static func previewText(
        _ content: String,
        expression: NSRegularExpression
    ) -> String {
        var preview = ""
        var cursor = content.startIndex
        let matches = expression.matches(
            in: content,
            range: NSRange(content.startIndex..., in: content)
        )
        for match in matches {
            guard let range = Range(match.range(at: 0), in: content),
                  let textRange = Range(match.range(at: 1), in: content),
                  let targetRange = Range(match.range(at: 2), in: content),
                  range.lowerBound >= cursor
            else { continue }
            preview += content[cursor..<range.lowerBound]
            preview += previewLabel(
                text: String(content[textRange]),
                target: String(content[targetRange])
            )
            cursor = range.upperBound
        }
        return preview + content[cursor...]
    }

    /// The same shaping the chip does: a typed target names its kind, and
    /// `ReferenceLabel` reads the link text for that kind. A target this client
    /// does not chip keeps its link text as written.
    private static func previewLabel(text: String, target: String) -> String {
        guard let reference = RichReferenceWireForm.read(target: target, text: text) else {
            return text
        }
        return reference.label
            ?? ReferenceLabel.display(text, kind: reference.kind, id: reference.id)
    }

    // The reference grammar without its scheme constraint: a preview reads the
    // words of every link, whether or not this client chips its target.
    private static let linkExpression = try? NSRegularExpression(
        pattern: #"\[([^\]]+)\]\(([^\)]+)\)"#
    )

    /// One Markdown link the body carries, and what this client makes of it.
    private struct MarkdownLink {
        /// A chipped reference, a link that stays a link, or Markdown that is
        /// not a link at all.
        enum Content {
            case reference(RichReferenceTarget)
            /// A target this client does not chip — a `haus://` resource, a
            /// `mailto:` address, a target naming no scheme. The App renders
            /// every one as an anchor, so the words stand in for the Markdown.
            case link(target: String)
            /// `![alt](src)` is an image, not a link, on both clients: its
            /// Markdown stays exactly as written.
            case verbatim
        }

        let range: Range<String.Index>
        let text: String
        let content: Content
    }

    private static func markdownLinks(
        in content: String,
        expression: NSRegularExpression
    ) -> [MarkdownLink] {
        expression
            .matches(in: content, range: NSRange(content.startIndex..., in: content))
            .compactMap { match in
                guard let range = Range(match.range(at: 0), in: content),
                      let textRange = Range(match.range(at: 1), in: content),
                      let targetRange = Range(match.range(at: 2), in: content)
                else { return nil }
                let text = String(content[textRange])
                let target = String(content[targetRange])
                let isImage = range.lowerBound > content.startIndex
                    && content[content.index(before: range.lowerBound)] == "!"
                return MarkdownLink(
                    range: range,
                    text: text,
                    content: linkContent(target: target, text: text, isImage: isImage)
                )
            }
    }

    private static func linkContent(
        target: String,
        text: String,
        isImage: Bool
    ) -> MarkdownLink.Content {
        guard !isImage else { return .verbatim }
        guard let reference = RichReferenceWireForm.read(target: target, text: text) else {
            return .link(target: target)
        }
        return .reference(reference)
    }

    private static func append(
        _ link: MarkdownLink,
        in content: String,
        style: RichInlineStyle,
        resolve: (MentionPresentationKind, String, String) -> RichReferencePresentation?,
        into segments: inout [RichMessageSegment]
    ) {
        switch link.content {
        case .reference(let target):
            segments.append(.reference(reference(target, text: link.text, resolve: resolve)))
        case .link(let target):
            segments.append(.link(text: link.text, target: target))
        case .verbatim:
            append(text: content[link.range], style: style, into: &segments)
        }
    }

    private static func reference(
        _ target: RichReferenceTarget,
        text: String,
        resolve: (MentionPresentationKind, String, String) -> RichReferencePresentation?
    ) -> RichReferencePresentation {
        resolve(target.kind, target.id, text)
            ?? RichReferencePresentation(
                id: target.id,
                kind: target.kind,
                label: target.label
                    ?? ReferenceLabel.display(text, kind: target.kind, id: target.id),
                avatarURL: nil
            )
    }

    /// Emits a stretch of prose, chipping the bare URLs in it the way the App's
    /// Markdown autolinks them.
    private static func appendAutolinked(
        _ slice: Substring,
        style: RichInlineStyle,
        into segments: inout [RichMessageSegment]
    ) {
        guard !slice.isEmpty else { return }
        var cursor = slice.startIndex
        for url in RichMessageAutolink.urls(in: slice) {
            guard let target = RichReferenceWireForm.read(
                target: String(slice[url]),
                text: String(slice[url])
            ) else { continue }
            append(text: slice[cursor..<url.lowerBound], style: style, into: &segments)
            segments.append(.reference(RichReferencePresentation(
                id: target.id,
                kind: target.kind,
                label: target.label ?? String(slice[url]),
                avatarURL: nil
            )))
            cursor = url.upperBound
        }
        append(text: slice[cursor..<slice.endIndex], style: style, into: &segments)
    }

    /// Prose reaches the renderer as few runs as possible: an image's Markdown
    /// is still the same sentence as the words around it, so it joins the text
    /// run beside it rather than starting another.
    private static func append(
        text: Substring,
        style: RichInlineStyle,
        into segments: inout [RichMessageSegment]
    ) {
        guard !text.isEmpty else { return }
        if case .text(let previous, let previousStyle) = segments.last, previousStyle == style {
            segments[segments.count - 1] = .text(previous + text, style: style)
            return
        }
        segments.append(.text(String(text), style: style))
    }
}
