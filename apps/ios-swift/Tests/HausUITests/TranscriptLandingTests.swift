import CoreGraphics
@testable import HausUI
import Testing

/// Opening a Thread on its first unread reply (ADR 0043), on the flipped
/// table: a 600pt viewport resting at offset -80 (the composer clearance),
/// with a 100pt navigation bar clearance at the visual top.
struct TranscriptLandingTests {
    private func landing(rowMinY: CGFloat, rowMaxY: CGFloat, maxOffsetY: CGFloat = 2_000) -> TranscriptLanding {
        TranscriptLanding(
            rowMinY: rowMinY,
            rowMaxY: rowMaxY,
            contentOffsetY: -80,
            boundsHeight: 600,
            bottomClearance: 80,
            topClearance: 100,
            minOffsetY: -80,
            maxOffsetY: maxOffsetY
        )
    }

    /// A reply already reading from the newest edge stays put, like Slack.
    @Test func staysPutWhenTheReplyAlreadyShows() {
        #expect(landing(rowMinY: 100, rowMaxY: 300).targetOffsetY == nil)
    }

    /// A reply above the fold scrolls up so its top sits under the bar with
    /// the reply before it peeking.
    @Test func bringsAHiddenReplysTopUnderTheBar() {
        // 1000 + 48 context - 600 viewport + 100 bar.
        #expect(landing(rowMinY: 900, rowMaxY: 1_000).targetOffsetY == CGFloat(548))
    }

    /// A reply whose top is cut off by the bar lands too.
    @Test func landsWhenOnlyTheReplysBottomShows() {
        #expect(landing(rowMinY: 300, rowMaxY: 500).targetOffsetY == CGFloat(48))
    }

    /// Landing never scrolls past the oldest content.
    @Test func clampsToTheOldestOffset() {
        #expect(landing(rowMinY: 900, rowMaxY: 1_000, maxOffsetY: 400).targetOffsetY == CGFloat(400))
    }
}
