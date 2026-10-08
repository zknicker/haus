@testable import HausUI
import Testing

@MainActor
struct HausDrawerStateTests {
    /// The Chat screen puts its keyboard away the moment this turns true, so it must cover the
    /// first frame of a drag as well as the settled open drawer.
    @Test func isEngagedFromTheFirstPanFrameUntilItSettlesShut() {
        let drawer = HausDrawerState()
        #expect(!drawer.isEngaged)

        drawer.beginDrag()
        #expect(drawer.isEngaged)

        drawer.commit(open: false)
        #expect(!drawer.isPresented)
        #expect(!drawer.isEngaged)

        drawer.set(open: true)
        #expect(drawer.isEngaged)
        drawer.set(open: false)
        #expect(!drawer.isEngaged)
    }

    @Test func aReleaseThatOpensEndsTheDragAndPresents() {
        let drawer = HausDrawerState()
        drawer.beginDrag()

        #expect(drawer.commit(open: true))
        #expect(drawer.isPresented)
        #expect(!drawer.isDragging)
    }

    /// The snap haptic plays only when the side changes.
    @Test func commitReportsWhetherTheSideChanged() {
        let drawer = HausDrawerState()
        #expect(drawer.commit(open: true))
        #expect(!drawer.commit(open: true))
        #expect(drawer.commit(open: false))
    }

    @Test func reportsEverySettledChangeOnce() {
        let drawer = HausDrawerState()
        var reported: [Bool] = []
        drawer.onPresentedChange = { reported.append($0) }

        drawer.set(open: true)
        drawer.set(open: true)
        drawer.beginDrag()
        drawer.commit(open: false)

        #expect(reported == [true, false])
    }

    /// With the UIKit container attached, the state never decides the side itself: the
    /// motion springs the canvas and reports the commit back.
    @Test func setAsksTheMotionToSettle() {
        let drawer = HausDrawerState()
        let motion = RecordingMotion(drawer: drawer)
        drawer.motion = motion

        drawer.toggle()
        #expect(motion.settles == [true])
        #expect(drawer.isPresented)

        drawer.toggle()
        #expect(motion.settles == [true, false])
        #expect(!drawer.isPresented)
    }

    @Test func sidebarVisibilityFlipsOnlyOnChange() {
        let drawer = HausDrawerState()
        #expect(drawer.isSidebarHidden)
        drawer.setSidebarHidden(false)
        #expect(!drawer.isSidebarHidden)
        drawer.setSidebarHidden(true)
        #expect(drawer.isSidebarHidden)
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

        drawer.beginDrag()

        #expect(drawer.close == .interactive)
    }
}

@MainActor
private final class RecordingMotion: HausDrawerMotion {
    let drawer: HausDrawerState
    var settles: [Bool] = []

    init(drawer: HausDrawerState) { self.drawer = drawer }

    func settle(open: Bool) {
        settles.append(open)
        drawer.commit(open: open)
    }
}
