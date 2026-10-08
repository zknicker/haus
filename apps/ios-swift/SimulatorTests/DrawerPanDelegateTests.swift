import UIKit
import XCTest
@testable import HausUI

/// The drawer's pan shares a drag only with scroll views. The regression: it
/// recognized alongside everything, so a right-drag over an Inbox row opened
/// the drawer and then fired the row's tap on release, opening that Chat.
@MainActor
final class DrawerPanDelegateTests: XCTestCase {
    func testSharesTheDragWithAScrollView() {
        let (pan, delegate) = Self.drawerPan()
        let scrollView = UIScrollView()
        XCTAssertTrue(
            delegate.gestureRecognizer(pan, shouldRecognizeSimultaneouslyWith: scrollView.panGestureRecognizer)
        )
    }

    func testDoesNotShareTheDragWithContentTapsOrPresses() {
        let (pan, delegate) = Self.drawerPan()
        let row = UIView()
        let tap = UITapGestureRecognizer()
        let press = UILongPressGestureRecognizer()
        row.addGestureRecognizer(tap)
        row.addGestureRecognizer(press)
        XCTAssertFalse(delegate.gestureRecognizer(pan, shouldRecognizeSimultaneouslyWith: tap))
        XCTAssertFalse(delegate.gestureRecognizer(pan, shouldRecognizeSimultaneouslyWith: press))
    }

    private static func drawerPan() -> (UIPanGestureRecognizer, DrawerPanDelegate) {
        let canvas = UIView()
        let pan = UIPanGestureRecognizer()
        let delegate = DrawerPanDelegate()
        pan.delegate = delegate
        canvas.addGestureRecognizer(pan)
        return (pan, delegate)
    }
}
