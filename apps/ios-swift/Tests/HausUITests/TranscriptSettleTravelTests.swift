import CoreGraphics
@testable import HausUI
import Testing

struct TranscriptSettleTravelTests {
    @Test func theCurveLeavesAtZeroAndArrivesAtOne() {
        #expect(TranscriptSettleTravel.progress(elapsed: 0) == 0)
        #expect(TranscriptSettleTravel.progress(elapsed: TranscriptSettleTravel.duration) == 1)
        #expect(TranscriptSettleTravel.progress(elapsed: -1) == 0)
        #expect(TranscriptSettleTravel.progress(elapsed: 10) == 1)
    }

    @Test func theCurveNeverRunsBackwards() {
        let samples = (0...60).map {
            TranscriptSettleTravel.progress(elapsed: TranscriptSettleTravel.duration * Double($0) / 60)
        }
        for (earlier, later) in zip(samples, samples.dropFirst()) {
            #expect(later >= earlier)
        }
    }

    /// The composer collapsing mid-travel moves home; the viewport moves with
    /// it in the same frame instead of the travel being cut short or snapping.
    @Test func aMovingHomeCarriesTheTravel() {
        let travel = makeTravel(startDistance: 120)
        let halfway = TranscriptSettleTravel.duration / 2
        let remaining = travel.offset(home: 0, at: halfway)
        #expect(remaining > 0 && remaining < 120)
        #expect(travel.offset(home: -40, at: halfway) == remaining - 40)
        #expect(travel.offset(home: -40, at: TranscriptSettleTravel.duration) == -40)
    }

    /// A travel can start past the newest edge — the composer shrank by more
    /// than the send's row grew — and still arrives exactly home.
    @Test func aTravelStartingPastHomeArrives() {
        let travel = makeTravel(startDistance: -50)
        #expect(travel.offset(home: -154, at: 0) == -204)
        #expect(travel.offset(home: -154, at: TranscriptSettleTravel.duration) == -154)
        #expect(!travel.isFinished(at: TranscriptSettleTravel.duration / 2))
        #expect(travel.isFinished(at: TranscriptSettleTravel.duration))
    }

    private func makeTravel(startDistance: CGFloat) -> TranscriptSettleTravel {
        var state = TranscriptNearNewest()
        return TranscriptSettleTravel(
            ticket: state.beginSettling(),
            startDistance: startDistance,
            startTime: 0,
            clock: 0
        )
    }
}
