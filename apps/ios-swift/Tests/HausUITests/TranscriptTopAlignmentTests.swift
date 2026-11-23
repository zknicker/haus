import CoreGraphics
@testable import HausUI
import Testing

/// A transcript shorter than the viewport rests under the header, and the
/// room under it closes as rows arrive until it is bottom-anchored as usual.
struct TranscriptTopAlignmentTests {
    private let base: CGFloat = 100
    private let boundsHeight: CGFloat = 800
    private let clearance: CGFloat = 120

    private func inset(contentHeight: CGFloat, boundsHeight: CGFloat = 800) -> CGFloat {
        TranscriptTopAlignment.tailInset(
            base: base,
            boundsHeight: boundsHeight,
            topClearance: clearance,
            contentHeight: contentHeight
        )
    }

    @Test func shortContentRestsUnderTheHeader() {
        #expect(inset(contentHeight: 200) == 480)
        #expect(boundsHeight - inset(contentHeight: 200) - 200 == clearance)
    }

    /// The oldest row's top stays put as each new row lands below it.
    @Test func newRowsGrowDownwardUntilTheyReachTheComposer() {
        for contentHeight in stride(from: CGFloat(200), through: 580, by: 40) {
            #expect(boundsHeight - inset(contentHeight: contentHeight) - contentHeight == clearance)
        }
    }

    @Test func overflowingContentKeepsTheComposersClearance() {
        #expect(inset(contentHeight: 580) == base)
        #expect(inset(contentHeight: 4_000) == base)
    }

    @Test func anUnsizedViewportKeepsTheComposersClearance() {
        #expect(inset(contentHeight: 0, boundsHeight: 0) == base)
    }
}
