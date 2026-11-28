@testable import HausUI
import Testing

struct MessageTimelineTailScrollTests {
    @Test func firstPageOfAChatArrivesAlreadySettled() {
        #expect(
            MessageTimelineTailScroll.decide(
                hadMessages: false,
                isNearBottom: true,
                isLatestPending: false
            ) == .snap
        )
    }

    @Test func firstPageSnapsEvenWhenTheReaderIsNotAtTheBottom() {
        // A freshly shown Chat has no reading position to respect yet, so the
        // page must not sweep into place.
        #expect(
            MessageTimelineTailScroll.decide(
                hadMessages: false,
                isNearBottom: false,
                isLatestPending: false
            ) == .snap
        )
    }

    @Test func appendAtTheBottomAnimates() {
        #expect(
            MessageTimelineTailScroll.decide(
                hadMessages: true,
                isNearBottom: true,
                isLatestPending: false
            ) == .animate
        )
    }

    @Test func ownSendRevealsItselfFromAboveTheTail() {
        #expect(
            MessageTimelineTailScroll.decide(
                hadMessages: true,
                isNearBottom: false,
                isLatestPending: true
            ) == .animate
        )
    }

    @Test func incomingMessageLeavesAScrolledBackReaderAlone() {
        #expect(
            MessageTimelineTailScroll.decide(
                hadMessages: true,
                isNearBottom: false,
                isLatestPending: false
            ) == .ignore
        )
    }
}
