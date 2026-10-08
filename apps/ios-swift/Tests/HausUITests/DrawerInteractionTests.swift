@testable import HausUI
import CoreGraphics
import XCTest

final class DrawerInteractionTests: XCTestCase {
    private let width: CGFloat = 320

    func testCanvasFollowsTheFingerInsideItsTravel() {
        XCTAssertEqual(
            DrawerInteraction.offset(start: 0, translation: 90, width: width),
            90,
            accuracy: 0.001
        )
        XCTAssertEqual(
            DrawerInteraction.offset(start: width, translation: -120, width: width),
            200,
            accuracy: 0.001
        )
    }

    func testDragStopsAtBothEnds() {
        XCTAssertEqual(
            DrawerInteraction.offset(start: width, translation: 160, width: width),
            width,
            accuracy: 0.001
        )
        XCTAssertEqual(
            DrawerInteraction.offset(start: 0, translation: -160, width: width),
            0,
            accuracy: 0.001
        )
    }

    /// A finger that catches a settle mid-flight drags from where the canvas is,
    /// not from the side it was heading to.
    func testADragCaughtMidSettleStartsFromTheCanvasPosition() {
        XCTAssertEqual(
            DrawerInteraction.offset(start: 137, translation: 20, width: width),
            157,
            accuracy: 0.001
        )
        XCTAssertEqual(
            DrawerInteraction.offset(start: 137, translation: -400, width: width),
            0,
            accuracy: 0.001
        )
    }

    func testDrawerWidthIsMostOfANarrowScreenAndCappedOnAWideOne() {
        XCTAssertEqual(DrawerInteraction.width(containerWidth: 402), 329.64, accuracy: 0.001)
        XCTAssertEqual(DrawerInteraction.width(containerWidth: 1024), 340, accuracy: 0.001)
        XCTAssertEqual(DrawerInteraction.width(containerWidth: 0), 0, accuracy: 0.001)
    }

    func testGeometryTracksProgressAcrossTheTravel() {
        let shut = DrawerGeometry(offset: 0, width: width)
        XCTAssertEqual(shut.progress, 0, accuracy: 0.001)
        XCTAssertEqual(shut.cornerRadius, 0, accuracy: 0.001)
        XCTAssertEqual(shut.sidebarShift, -width * DrawerGeometry.parallax, accuracy: 0.001)
        XCTAssertEqual(shut.sidebarReveal, 0, accuracy: 0.001)
        XCTAssertTrue(shut.isSidebarHidden)

        let half = DrawerGeometry(offset: 160, width: width)
        XCTAssertEqual(half.progress, 0.5, accuracy: 0.001)
        XCTAssertEqual(half.cornerRadius, DrawerGeometry.maxCornerRadius / 2, accuracy: 0.001)
        XCTAssertEqual(half.sidebarReveal, 160, accuracy: 0.001)
        XCTAssertFalse(half.isSidebarHidden)

        let open = DrawerGeometry(offset: width, width: width)
        XCTAssertEqual(open.cornerRadius, DrawerGeometry.maxCornerRadius, accuracy: 0.001)
        XCTAssertEqual(open.sidebarShift, 0, accuracy: 0.001)
    }

    /// A spring overshooting either end must not push the derived values past
    /// their range: no negative corner, no sidebar uncovered past its width.
    func testGeometryClampsAnOvershootingSpring() {
        let past = DrawerGeometry(offset: width + 12, width: width)
        XCTAssertEqual(past.progress, 1, accuracy: 0.001)
        XCTAssertEqual(past.sidebarReveal, width, accuracy: 0.001)
        let before = DrawerGeometry(offset: -8, width: width)
        XCTAssertEqual(before.progress, 0, accuracy: 0.001)
        XCTAssertEqual(before.cornerRadius, 0, accuracy: 0.001)
        XCTAssertEqual(before.sidebarReveal, 0, accuracy: 0.001)
    }

    func testShortFlickOpensTheDrawer() {
        XCTAssertTrue(DrawerInteraction.settlesOpen(offset: 40, velocity: 1200, width: width))
    }

    func testSlowDragPastTheMidpointOpensTheDrawer() {
        XCTAssertTrue(DrawerInteraction.settlesOpen(offset: 200, velocity: 30, width: width))
        XCTAssertFalse(DrawerInteraction.settlesOpen(offset: 140, velocity: 30, width: width))
    }

    func testReverseFlickClosesAnAlmostOpenDrawer() {
        XCTAssertFalse(DrawerInteraction.settlesOpen(offset: 300, velocity: -900, width: width))
    }

    func testSettleVelocityIsNormalizedToTheRemainingDistance() {
        let velocity = DrawerInteraction.settleVelocity(velocity: 600, offset: 220, target: width)
        XCTAssertEqual(velocity, 6, accuracy: 0.001)

        XCTAssertEqual(
            DrawerInteraction.settleVelocity(velocity: 600, offset: width, target: width),
            0,
            accuracy: 0.001
        )
        XCTAssertLessThanOrEqual(
            DrawerInteraction.settleVelocity(velocity: 4000, offset: 319, target: width),
            25
        )
    }

    func testOnlyHorizontalDragsMoveTheDrawer() {
        XCTAssertTrue(DrawerInteraction.accepts(velocity: CGPoint(x: 300, y: 40), isOpen: false))
        XCTAssertFalse(DrawerInteraction.accepts(velocity: CGPoint(x: 60, y: 400), isOpen: false))
    }

    func testAClosedDrawerOnlyAcceptsRightwardDrags() {
        XCTAssertFalse(DrawerInteraction.accepts(velocity: CGPoint(x: -300, y: 20), isOpen: false))
        XCTAssertTrue(DrawerInteraction.accepts(velocity: CGPoint(x: -300, y: 20), isOpen: true))
    }
}
