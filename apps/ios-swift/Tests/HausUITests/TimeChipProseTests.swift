import Foundation
@testable import HausUI
import Testing

/// Where the body parser chips clock times: prose, list items, headings, and
/// table cells, as the App's `proseChipComponents` does — never code, a code
/// block, or a blockquote, and never without a sent time.
struct TimeChipProseTests {
    private static let eastern = TimeZone(identifier: "America/New_York")!
    // Friday, October 9, 2026 at 12:00 PM EDT.
    private static let context = TimeChipContext(
        sentAt: Date(timeIntervalSince1970: 1_791_561_600),
        viewerZone: eastern
    )

    private static func blocks(_ content: String) -> [RichMessageBlock] {
        RichMessageBlockParser.blocks(content, timeChips: context) { _, _, _ in nil }
    }

    private static func chips(_ segments: [RichMessageSegment]) -> [RichReferencePresentation] {
        segments.compactMap { segment in
            if case .reference(let reference) = segment, reference.kind == .time { return reference }
            return nil
        }
    }

    @Test func chipsTheWebProofMessageAndLeavesTheRestAsWritten() throws {
        let blocks = Self.blocks("""
        Standup is tomorrow at 12 PM ET, the review is 3 PM ET, and the deploy window is 10–11 AM ET. \
        Release cut is Oct 16 at 11 AM ET.

        Not chips: tomorrow morning, Friday ET, in 3 hours, at 3 PM, and `3 PM ET` in code.

        > Quoted: 3 PM ET stays plain.
        """)
        guard case .paragraph(let first) = blocks[0],
              case .paragraph(let second) = blocks[1],
              case .quote(let quoted) = blocks[2],
              case .paragraph(let quote) = quoted.first
        else {
            Issue.record("Unexpected blocks \(blocks)")
            return
        }
        let chips = Self.chips(first)
        #expect(chips.map(\.id) == [
            "2026-10-10T16:00:00.000Z",
            "2026-10-09T19:00:00.000Z",
            "2026-10-09T14:00:00.000Z/2026-10-09T15:00:00.000Z",
            "2026-10-16T15:00:00.000Z",
        ])
        #expect(chips.allSatisfy { $0.viewerTimeZone == Self.eastern && $0.mark == .glyph(.reminder) })
        #expect(first.first == .text("Standup is "))
        #expect(Self.chips(second).isEmpty)
        #expect(second.contains(.text("3 PM ET", style: .code)))
        #expect(Self.chips(quote).isEmpty)
    }

    @Test func chipsListItemsHeadingsAndTableCells() {
        let blocks = Self.blocks("""
        # Launch 3 PM ET
        - Sync 9am PT
        | When | What |
        | --- | --- |
        | 15:00 UTC | Deploy |
        """)
        let found: [Int] = blocks.map { block in
            switch block {
            case .heading(_, let segments): Self.chips(segments).count
            case .list(let items): items.map { Self.chips($0.segments).count }.reduce(0, +)
            case .table(let table): table.rows.flatMap { $0 }.map { Self.chips($0).count }.reduce(0, +)
            default: -1
            }
        }
        #expect(found == [1, 1, 1])
    }

    @Test func keepsEmphasisAroundAChip() {
        let segments = RichMessageParser.parse("**due 3 PM ET sharp**", timeChips: Self.context) { _, _, _ in nil }
        #expect(segments.first == .text("due ", style: .bold))
        #expect(Self.chips(segments).count == 1)
        #expect(segments.last == .text(" sharp", style: .bold))
    }

    /// A line break is its own node on the App, so a time never spans one.
    @Test func aChipNeverSpansALineBreak() {
        let segments = RichMessageParser.parse("at 3 PM\nET, then 4 PM ET", timeChips: Self.context) { _, _, _ in nil }
        #expect(Self.chips(segments).map(\.id) == ["2026-10-09T20:00:00.000Z"])
        #expect(segments.first == .text("at 3 PM\nET, then "))
    }

    @Test func noSentTimeMeansNoChips() {
        let segments = RichMessageParser.parse("Call at 3 PM ET.") { _, _, _ in nil }
        #expect(segments == [.text("Call at 3 PM ET.")])
    }

    @Test func aChipActivatesInAppWithoutTheSystem() throws {
        let segments = RichMessageParser.parse("Call at 3 PM ET.", timeChips: Self.context) { _, _, _ in nil }
        let chip = try #require(Self.chips(segments).first)
        #expect(chip.activationURL?.scheme == TimeReference.scheme)
        #expect(RichMessageInlineText.soleActivationURL(segments) == nil)
    }
}
