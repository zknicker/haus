@testable import HausUI
import Testing

/// The transcript substrate acts on exact snapshot-to-snapshot classification,
/// not scroll geometry: these pin the shapes a Chat's page can take.
struct TranscriptListUpdateTests {
    @Test func unchangedIDsAreARefresh() {
        #expect(
            TranscriptListUpdate.classify(old: ["a", "b"], new: ["a", "b"]) == .refresh
        )
    }

    @Test func newerMessagesAtTheTailAreAnAppend() {
        #expect(
            TranscriptListUpdate.classify(old: ["a", "b"], new: ["a", "b", "c", "d"])
                == .append(appended: 2)
        )
    }

    @Test func olderHistoryAtTheHeadIsAPrepend() {
        #expect(
            TranscriptListUpdate.classify(old: ["c", "d"], new: ["a", "b", "c", "d"])
                == .prepend(prepended: 2)
        )
    }

    @Test func aFirstPageIsAReset() {
        #expect(
            TranscriptListUpdate.classify(old: [], new: ["a", "b"]) == .reset
        )
    }

    @Test func anEmptyTranscriptStayingEmptyIsARefresh() {
        #expect(TranscriptListUpdate.classify(old: [], new: []) == .refresh)
    }

    @Test func anEdgeShrunkenPageIsAWindowChange() {
        #expect(
            TranscriptListUpdate.classify(old: ["a", "b", "c"], new: ["b", "c"])
                == .window(appended: 0)
        )
    }

    @Test func aRewrittenPageIsAReset() {
        #expect(
            TranscriptListUpdate.classify(old: ["a", "b"], new: ["x", "y", "z"]) == .reset
        )
        #expect(
            TranscriptListUpdate.classify(old: ["a", "b"], new: ["a", "x"])
                == .window(appended: 1)
        )
    }

    @Test func aSimultaneousPrependAndAppendIsAWindowChange() {
        // Both ends can grow when the bounded window retains its overlap.
        #expect(
            TranscriptListUpdate.classify(old: ["b"], new: ["a", "b", "c"])
                == .window(appended: 1)
        )
    }

    @Test func aSlidingWindowRetainsTheMiddleAndChangesBothEdges() {
        #expect(
            TranscriptListUpdate.classify(
                old: ["message-10", "message-11", "message-12"],
                new: ["message-11", "message-12", "message-13"]
            ) == .window(appended: 1)
        )
    }

    @Test func anEdgeOnlyWindowChangeCanRemoveRowsWithoutAddingAny() {
        #expect(
            TranscriptListUpdate.classify(
                old: ["a", "b", "c", "d"],
                new: ["b", "c"]
            ) == .window(appended: 0)
        )
    }

    @Test func aReorderedOverlapStillResets() {
        #expect(
            TranscriptListUpdate.classify(
                old: ["a", "b", "c"],
                new: ["b", "a", "c"]
            ) == .reset
        )
    }

    @Test func aFixedPrefixWithSlidingRepliesKeepsItsSharedOrder() {
        #expect(
            TranscriptListUpdate.classify(
                old: ["header", "reply-1", "reply-2"],
                new: ["header", "reply-2", "reply-3"]
            ) == .window(appended: 1)
        )
    }
}
