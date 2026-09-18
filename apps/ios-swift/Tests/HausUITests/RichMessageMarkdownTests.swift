import Foundation
@testable import HausUI
import SwiftUI
import Testing

/// The Markdown a settled reply is written in, read the way the App reads it.
///
/// The App renders message bodies with `remark-gfm` and `remark-breaks`, so the
/// phone answers the same grammar: marks, headings, lists, quotes, fences,
/// rules, and pipe tables — with the reference chips and autolinks this client
/// has always drawn still working inside every one of them.
struct RichMessageMarkdownTests {
    // MARK: - Inline marks

    @Test func readsBoldItalicStrikeAndCodeAsMarksRatherThanCharacters() {
        let segments = parse("Ship **now**, *really* ~~maybe~~ and `code`.")

        #expect(segments == [
            .text("Ship "),
            .text("now", style: .bold),
            .text(", "),
            .text("really", style: .italic),
            .text(" "),
            .text("maybe", style: .strikethrough),
            .text(" and "),
            .text("code", style: .code),
            .text("."),
        ])
    }

    @Test func nestsAMarkInsideAnother() {
        #expect(parse("**bold and _both_**") == [
            .text("bold and ", style: .bold),
            .text("both", style: [.bold, .italic]),
        ])
    }

    /// An underscore in the middle of a word is part of the word on both
    /// clients — a file name is not emphasis.
    @Test func leavesAnIntrawordUnderscoreAlone() {
        #expect(parse("read agent_html_tokens now") == [.text("read agent_html_tokens now")])
    }

    /// Everything inside backticks is literal, which is the rule the whole
    /// design hangs on: a span may carry the markup of any other mark.
    @Test func keepsMarkupInsideACodeSpanLiteral() {
        #expect(parse("call `**not bold** | x` twice") == [
            .text("call "),
            .text("**not bold** | x", style: .code),
            .text(" twice"),
        ])
    }

    // MARK: - Blocks

    @Test func readsAHeadingAsAHeadingBlock() {
        #expect(blocks("## What I found") == [.heading(level: 2, [.text("What I found")])])
    }

    @Test func readsNestedListsAsRowsCarryingTheirDepth() {
        guard case let .list(items)? = blocks("- one\n  - two\n- three").first else {
            Issue.record("expected one list block")
            return
        }
        #expect(items.map(\.depth) == [0, 1, 0])
        #expect(items.map(\.marker) == [.bullet, .bullet, .bullet])
        #expect(items.map { RichMessageInlineText.plainText($0.segments) } == ["one", "two", "three"])
    }

    @Test func keepsAnOrderedMarkersOwnNumber() {
        guard case let .list(items)? = blocks("3. third\n4. fourth").first else {
            Issue.record("expected one list block")
            return
        }
        #expect(items.map(\.marker) == [.ordered(3), .ordered(4)])
    }

    @Test func readsAQuoteAsBlocksInsideAQuote() {
        #expect(blocks("> careful **here**") == [
            .quote([.paragraph([.text("careful "), .text("here", style: .bold)])]),
        ])
    }

    @Test func readsAThematicBreakAsARule() {
        #expect(blocks("above\n\n---\n\nbelow") == [
            .paragraph([.text("above")]),
            .rule,
            .paragraph([.text("below")]),
        ])
    }

    /// A single newline is a line break on the App — it renders message
    /// Markdown with `remark-breaks` — so one paragraph keeps its own newline
    /// rather than collapsing to a space.
    @Test func keepsASingleNewlineInsideAParagraph() {
        #expect(blocks("first line\nsecond line") == [.paragraph([.text("first line\nsecond line")])])
    }

    // MARK: - Fenced code

    @Test func keepsMarkdownLookingContentInsideAFenceLiteral() {
        let source = "```swift\n# not a heading **not bold** | not a table\n```"

        #expect(blocks(source) == [
            .code(language: "swift", text: "# not a heading **not bold** | not a table"),
        ])
    }

    /// A fence that has not closed yet is a fence: mid-stream it runs to the end
    /// of what has arrived, so the block does not reflow on the next chunk.
    @Test func readsAnUnterminatedFenceAsACodeBlockToTheEnd() {
        #expect(blocks("```\nlet x = 1\nlet y = 2") == [
            .code(language: nil, text: "let x = 1\nlet y = 2"),
        ])
    }

    // MARK: - Tables

    @Test func readsAPipeTableWithItsAlignmentsAndInlineContent() {
        let source = """
        | Agent | Runs |
        | :--- | ---: |
        | [@Cove](agent://agt_cove) | **12** |
        """

        guard case let .table(table)? = blocks(source).first else {
            Issue.record("expected one table block")
            return
        }
        #expect(table.alignments == [.leading, .trailing])
        #expect(table.header.map(RichMessageInlineText.plainText) == ["Agent", "Runs"])
        #expect(table.rows.count == 1)
        guard case let .reference(reference)? = table.rows[0][0].first else {
            Issue.record("expected the cell's link to resolve to a chip")
            return
        }
        #expect(reference.kind == .agent)
        #expect(reference.label == "Cove")
        #expect(table.rows[0][1] == [.text("12", style: .bold)])
    }

    @Test func honoursACenteredColumnAndPadsAShortRow() {
        let source = """
        | a | b | c |
        |---|:-:|--:|
        | 1 |
        """

        guard case let .table(table)? = blocks(source).first else {
            Issue.record("expected one table block")
            return
        }
        #expect(table.alignments == [.leading, .center, .trailing])
        #expect(table.rows[0].count == 3)
        #expect(table.rows[0].map(RichMessageInlineText.plainText) == ["1", "", ""])
    }

    /// Until the delimiter row lands there is no table — which is exactly what
    /// a table looks like halfway through streaming.
    @Test func leavesAHeaderRowAsProseUntilTheDelimiterRowArrives() {
        #expect(blocks("| Agent | Runs |") == [.paragraph([.text("| Agent | Runs |")])])
    }

    /// A table need not open with a pipe, and its header line starts with an
    /// ordinary letter — the one block opener the parser's first-character
    /// fast path cannot recognize, so it is found by its pipes instead.
    @Test func readsATableWrittenWithoutItsOuterPipes() {
        let source = "Agent | Runs\n:--- | ---:\nCove | 12"

        guard case let .table(table)? = blocks(source).first else {
            Issue.record("expected one table block")
            return
        }
        #expect(table.header.map(RichMessageInlineText.plainText) == ["Agent", "Runs"])
        #expect(table.rows.map { $0.map(RichMessageInlineText.plainText) } == [["Cove", "12"]])
    }

    @Test func readsAnEscapedPipeAsACellsOwnCharacter() {
        let source = "| a | b |\n|---|---|\n| x \\| y | z |"

        guard case let .table(table)? = blocks(source).first else {
            Issue.record("expected one table block")
            return
        }
        #expect(table.rows[0].map(RichMessageInlineText.plainText) == ["x | y", "z"])
    }

    // MARK: - What was already true

    @Test func stillChipsAReferenceAndStillAutolinksABareAddress() {
        let segments = parse("Ask [@Cove](agent://agt_cove) or read https://haus.dev today")

        guard case let .reference(agent) = segments[1],
              case let .reference(site) = segments[3]
        else {
            Issue.record("expected a chipped agent and a chipped address")
            return
        }
        #expect(agent.kind == .agent)
        #expect(agent.label == "Cove")
        #expect(site.kind == .website)
        #expect(segments.first == .text("Ask "))
    }

    /// A target carrying underscores is an address, not emphasis: the emphasis
    /// scan steps over every link it finds.
    @Test func neverReadsALinkTargetAsEmphasis() {
        let segments = parse("open [notes](https://haus.dev/a_b_c) and _then_ stop")

        #expect(segments.contains(.text("then", style: .italic)))
        guard case let .reference(site) = segments[1] else {
            Issue.record("expected the link to survive as a reference")
            return
        }
        #expect(site.kind == .website)
    }

    // MARK: - Drawing

    /// A code span's plate belongs to the layout manager. `.backgroundColor`
    /// fills the whole line fragment for a run that wraps, which painted a grey
    /// bar from the span's last word out to the right margin — so the span is
    /// marked for `RichReferenceLayoutManager` and carries no background of its
    /// own.
    @Test func marksACodeSpanForTheLayoutManagerRatherThanFillingItsLine() {
        let body = RichMessageAttributedText.make(
            segments: [.text("run "), .text("haus agents logs", style: .code)],
            font: .systemFont(ofSize: 17),
            metrics: RichReferenceMetricsFixture.sanFrancisco(pointSize: 17)
        )
        let whole = NSRange(location: 0, length: body.length)

        var marked = NSRange(location: 0, length: 0)
        #expect(body.attribute(.hausCodeSpan, at: 4, longestEffectiveRange: &marked, in: whole) != nil)
        #expect(marked == NSRange(location: 4, length: "haus agents logs".count))
        #expect(body.attribute(.hausCodeSpan, at: 0, effectiveRange: nil) == nil)

        body.enumerateAttribute(.backgroundColor, in: whole) { value, _, _ in
            #expect(value == nil)
        }
    }

    /// A body that uses every block kind has to draw as more than a paragraph.
    /// The measurement is the point: a `Grid` that resolved to no columns, or a
    /// horizontal scroll view that reported no height, would still type-check.
    @MainActor
    @Test func drawsEveryBlockKindWithoutCollapsing() {
        let source = """
        ## Heading

        Body with **marks**.

        | a | b |
        |---|--:|
        | 1 | 2 |

        - one
          - two

        > quoted

        ```
        code
        ```
        """

        guard let rich = renderedHeight(source), let plain = renderedHeight("Body with marks.") else {
            Issue.record("expected both bodies to render")
            return
        }
        #expect(rich > plain * 4)
    }

    @MainActor
    private func renderedHeight(_ source: String) -> Int? {
        let renderer = ImageRenderer(
            content: RichMessageContentView(blocks: blocks(source))
                .frame(width: 320, alignment: .leading)
        )
        return renderer.cgImage?.height
    }

    private func parse(_ content: String) -> [RichMessageSegment] {
        RichMessageParser.parse(content) { _, _, _ in nil }
    }

    private func blocks(_ content: String) -> [RichMessageBlock] {
        RichMessageBlockParser.blocks(content) { _, _, _ in nil }
    }
}
