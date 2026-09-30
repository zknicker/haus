import Foundation
import Testing
@testable import HausUI

/// The stamp's keyframes, sampled by time.
struct StampMotionTests {
    @Test func fadesInHugeLandsAtRestAndSettles() {
        let start = StampMotion.pose(at: 0)
        #expect(start.opacity == 0)
        #expect(start.scaleX == 8)

        let landing = StampMotion.pose(at: StampMotion.duration * 0.44)
        #expect(abs(landing.scaleX - 1) < 0.001)
        #expect(abs(landing.rotation) < 0.001)

        let squash = StampMotion.pose(at: StampMotion.duration * 0.52)
        #expect(abs(squash.scaleX - 1.22) < 0.001)
        #expect(abs(squash.scaleY - 0.76) < 0.001)

        #expect(StampMotion.pose(at: StampMotion.duration) == .rest)
    }

    @Test func fallAccelerates() {
        let early = StampMotion.pose(at: StampMotion.duration * 0.15).scaleX
        let middle = StampMotion.pose(at: StampMotion.duration * 0.27).scaleX
        let late = StampMotion.pose(at: StampMotion.duration * 0.39).scaleX

        // The second half of the fall covers more scale than the first.
        #expect(middle - late > early - middle)
    }

    @Test func rowThudsTwoPointsThenSettles() {
        #expect(StampMotion.thudOffset(sinceLanding: -0.1) == 0)
        let deepest = stride(from: 0.0, through: 0.25, by: 0.005)
            .map { StampMotion.thudOffset(sinceLanding: $0) }
            .max() ?? 0
        #expect(abs(deepest - 2) < 0.1)
        #expect(StampMotion.thudOffset(sinceLanding: 0.3) == 0)
    }
}
