@testable import HausUI
import CoreGraphics
import Testing

@MainActor
struct HausDrawerStateTests {
    private let width: CGFloat = 320

    @Test func aPanTracksTheFingerAndSettlesOnRelease() {
        let drawer = HausDrawerState()

        drawer.handle(.changed(translation: 200), width: width)
        #expect(drawer.offset(width: width) == 200)
        #expect(drawer.progress(width: width) == 200 / width)
        #expect(!drawer.isPresented)

        drawer.handle(.ended(translation: 200, velocity: 0), width: width)
        #expect(drawer.isPresented)
        #expect(drawer.dragTranslation == nil)
        #expect(drawer.offset(width: width) == width)
    }

    /// The Chat screen puts its keyboard away the moment this turns true, so it must cover the
    /// first frame of a drag as well as the settled open drawer.
    @Test func isEngagedFromTheFirstPanFrameUntilItSettlesShut() {
        let drawer = HausDrawerState()
        #expect(!drawer.isEngaged)

        drawer.handle(.changed(translation: 4), width: width)
        #expect(drawer.isEngaged)

        drawer.handle(.ended(translation: 4, velocity: 0), width: width)
        #expect(!drawer.isPresented)
        #expect(!drawer.isEngaged)

        drawer.set(open: true)
        #expect(drawer.isEngaged)
        drawer.set(open: false)
        #expect(!drawer.isEngaged)
    }

    @Test func aFlickClosesAnOpenDrawerWhereverItIsReleased() {
        let drawer = HausDrawerState()
        drawer.set(open: true)

        drawer.handle(.ended(translation: -20, velocity: -900), width: width)

        #expect(!drawer.isPresented)
        #expect(drawer.offset(width: width) == 0)
    }

    @Test func reportsEverySettledChangeOnce() {
        let drawer = HausDrawerState()
        var reported: [Bool] = []
        drawer.onPresentedChange = { reported.append($0) }

        drawer.set(open: true)
        drawer.set(open: true)
        drawer.handle(.changed(translation: -300), width: width)
        drawer.handle(.ended(translation: -300, velocity: 0), width: width)

        #expect(reported == [true, false])
    }

    @Test func openingRestoresTheVeilAChatSelectionSuppressed() {
        let drawer = HausDrawerState()
        drawer.close = .chatSelection

        drawer.set(open: true)

        #expect(drawer.close == .interactive)
    }

    @Test func aFingerOnTheCanvasIsAlwaysAnInteractiveClose() {
        let drawer = HausDrawerState()
        drawer.set(open: true)
        drawer.close = .chatSelection

        drawer.handle(.changed(translation: -40), width: width)

        #expect(drawer.close == .interactive)
    }
}
