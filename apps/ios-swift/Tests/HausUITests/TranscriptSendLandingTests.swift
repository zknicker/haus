import CoreGraphics
@testable import HausUI
import Testing

/// The tail inset that holds the reader's own send at the top, and how the
/// landing survives the updates that follow it.
struct TranscriptSendLandingTests {
    private let base: CGFloat = 100
    private let boundsHeight: CGFloat = 800
    private let clearance: CGFloat = 120

    @Test func aShortSendOpensTheRoomUnderIt() {
        let inset = TranscriptSendLanding.tailInset(
            base: base,
            boundsHeight: boundsHeight,
            topClearance: clearance,
            landedHeight: 80
        )
        #expect(inset == 600)
    }

    /// The landed row's top stays one top clearance under the viewport's top
    /// edge however much reply arrives below it, until the reply fills the room.
    @Test func repliesFillTheRoomWithoutMovingTheLandedRow() {
        for landedHeight in stride(from: CGFloat(80), through: 560, by: 40) {
            let inset = TranscriptSendLanding.tailInset(
                base: base,
                boundsHeight: boundsHeight,
                topClearance: clearance,
                landedHeight: landedHeight
            )
            let restingOffset = -inset
            let distanceFromTop = restingOffset + boundsHeight - landedHeight
            #expect(distanceFromTop == clearance)
            #expect(!TranscriptSendLanding.isFilled(
                base: base,
                boundsHeight: boundsHeight,
                topClearance: clearance,
                landedHeight: landedHeight
            ))
        }
    }

    @Test func aFilledRoomFallsBackToTheComposersClearance() {
        let landedHeight: CGFloat = 700
        #expect(TranscriptSendLanding.tailInset(
            base: base,
            boundsHeight: boundsHeight,
            topClearance: clearance,
            landedHeight: landedHeight
        ) == base)
        #expect(TranscriptSendLanding.isFilled(
            base: base,
            boundsHeight: boundsHeight,
            topClearance: clearance,
            landedHeight: landedHeight
        ))
    }

    @Test func aSurvivingLandedRowKeepsItsLanding() {
        let landed = TranscriptSendLanding.reconcile("p", old: ["a", "b", "p"], new: ["a", "b", "p", "r"])
        #expect(landed == "p")
    }

    @Test func theDurableRowTakesOverAnOptimisticLanding() {
        #expect(TranscriptSendLanding.reconcile("p", old: ["a", "b", "p"], new: ["a", "b", "d"]) == "d")
        #expect(TranscriptSendLanding.reconcile("p", old: ["a", "b", "p"], new: ["a", "b", "d", "r"]) == "d")
        #expect(TranscriptSendLanding.reconcile(
            "p",
            old: ["a", "b", "p", "q"],
            new: ["a", "b", "p2", "q2"]
        ) == "p2")
    }

    @Test func pagingTheLandedRowAwayEndsTheLanding() {
        #expect(TranscriptSendLanding.reconcile("p", old: ["c", "d", "e", "p"], new: ["a", "b", "c", "d"]) == nil)
        #expect(TranscriptSendLanding.reconcile("p", old: ["a", "p"], new: ["x", "y"]) == nil)
        #expect(TranscriptSendLanding.reconcile(nil, old: ["a"], new: ["a", "b"]) == nil)
    }
}
