import Foundation
@testable import HausUI
import Testing

/// Both styles over one long history: paging in either direction, an exact
/// jump, an optimistic send's reconciliation, and which rows each update
/// re-hosts. The substrate must not care which style draws the rows.
struct TranscriptStyleComparisonTests {
    private typealias Fixture = TranscriptStyleFixture
    private static let history = Fixture.history(turns: 200)

    private func entries(_ messages: ArraySlice<MessagePresentation>, _ style: TranscriptStyle) -> [MessageTimelineEntry] {
        MessageTimelineProjection.entries(for: Array(messages), style: style, calendar: Fixture.utc)
    }

    @Test(arguments: [TranscriptStyle.roster, .assistant])
    func pagingOlderReHostsOnlyTheRowThatGainedANeighbour(style: TranscriptStyle) {
        let full = Self.history
        let window = full.suffix(120)
        let paged = full.suffix(180)

        let before = entries(window, style)
        let after = entries(paged, style)

        #expect(TranscriptListUpdate.classify(old: before.map(\.id), new: after.map(\.id)) == .prepend(prepended: 60))
        #expect(Fixture.changedIDs(from: before, to: after) == [window.first!.id])
    }

    @Test(arguments: [TranscriptStyle.roster, .assistant])
    func pagingNewerSlidesTheWindowAndReHostsOnlyItsNewHead(style: TranscriptStyle) {
        let full = Self.history
        let before = entries(full[100..<220], style)
        let after = entries(full[160..<280], style)

        #expect(TranscriptListUpdate.classify(old: before.map(\.id), new: after.map(\.id)) == .window(appended: 60))
        #expect(Fixture.changedIDs(from: before, to: after) == [full[160].id])
    }

    @Test(arguments: [TranscriptStyle.roster, .assistant])
    func anExactJumpLandsOnTheSameRowTheFullHistoryDraws(style: TranscriptStyle) {
        let full = Self.history
        let target = full[40]
        let current = entries(full.suffix(120), style)
        let around = entries(full[10..<70], style)
        let whole = entries(full[...], style)

        #expect(TranscriptListUpdate.classify(old: current.map(\.id), new: around.map(\.id)) == .reset)
        let jumped = around.first { $0.id == target.id }
        let drawn = whole.first { $0.id == target.id }
        #expect(jumped?.grouping == drawn?.grouping)
        #expect(jumped?.topSpacing == drawn?.topSpacing)
    }

    @Test(arguments: [TranscriptStyle.roster, .assistant])
    func anOptimisticSendHandsItsRowAndLandingToTheDurableOne(style: TranscriptStyle) {
        let window = Array(Self.history.suffix(120))
        let at = window.last!.createdAt.timeIntervalSince(Fixture.start) + 20 * 60
        let pending = Fixture.message("pending-1", by: Fixture.person, at: at, isPending: true)
        let durable = Fixture.message("durable-1", by: Fixture.person, at: at)
        let reply = Fixture.message("reply-1", by: Fixture.captain, at: at + 30)

        let resting = entries(window[...], style)
        let sent = entries((window + [pending])[...], style)
        let confirmed = entries((window + [durable, reply])[...], style)

        #expect(TranscriptListUpdate.classify(old: resting.map(\.id), new: sent.map(\.id)) == .append(appended: 1))
        #expect(Fixture.changedIDs(from: resting, to: sent).isEmpty)

        let confirmUpdate = TranscriptListUpdate.classify(old: sent.map(\.id), new: confirmed.map(\.id))
        #expect(confirmUpdate == .window(appended: 2))
        #expect(TranscriptListUpdate.replacedTailCount(old: sent.map(\.id), new: confirmed.map(\.id)) == 1)
        #expect(TranscriptSendLanding.reconcile(
            pending.id,
            old: sent.map(\.id),
            new: confirmed.map(\.id)
        ) == durable.id)
        #expect(sent.last?.grouping == confirmed[confirmed.count - 2].grouping)
        #expect(Fixture.changedIDs(from: sent, to: confirmed).isEmpty)
    }

    @Test(arguments: [TranscriptStyle.roster, .assistant])
    func aStreamedReplyReHostsOnlyItsOwnRow(style: TranscriptStyle) {
        let window = Array(Self.history.suffix(120))
        let last = window.last!
        let grown = MessagePresentation(
            id: last.id,
            author: last.author,
            content: last.content + " And more.",
            createdAt: last.createdAt
        )
        let before = entries(window[...], style)
        let after = entries((window.dropLast() + [grown])[...], style)

        let changed = Fixture.changedIDs(from: before, to: after)
        let previous = Dictionary(before.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
        let rows = TranscriptRowReconfiguration.rows(
            visible: Array(0..<12),
            itemCount: after.count,
            revisionChanged: false,
            changedItem: { row in
                let entry = after[after.count - 1 - row]
                return previous[entry.id].map { $0 != entry } ?? false
            }
        )

        #expect(changed == [last.id])
        #expect(rows == [0])
    }

    @Test func theStylesGroupTheSameHistoryDifferently() {
        let roster = entries(Self.history[...], .roster)
        let assistant = entries(Self.history[...], .assistant)

        #expect(roster.contains { $0.grouping.divider == .day })
        #expect(!roster.contains { $0.grouping.divider == .time })
        #expect(assistant.filter { $0.grouping.divider == .time }.count == 200)
        #expect(!assistant.contains { $0.grouping.divider == .day })
    }
}
