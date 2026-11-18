@testable import HausUI
import SwiftUI
import XCTest

@MainActor
final class ComposerPortalPresenterTests: XCTestCase {
    /// The window is a pane of glass except while a portal is genuinely open. Anything else — a
    /// card mid-removal, a media card collapsing into its landing tile, a screen that simply has a
    /// composer — has to hand every touch straight through to the app underneath.
    func testTheOverlayWindowOnlyTakesTouchesForAnOpenPortal() {
        XCTAssertFalse(ComposerPortalWindowRule.ownsTheScreen(overlay: nil))
        XCTAssertTrue(ComposerPortalWindowRule.ownsTheScreen(overlay: .sources))
        XCTAssertTrue(ComposerPortalWindowRule.ownsTheScreen(overlay: .photos))
        XCTAssertTrue(ComposerPortalWindowRule.ownsTheScreen(overlay: .camera))
    }

    /// screen must not take the arriving screen's portal with it.
    func testALeavingScreenNeverClearsTheScreenThatReplacedIt() {
        let presenter = ComposerPortalPresenter()
        let chat = host()
        let task = host()

        presenter.present(chat)
        presenter.present(task)
        presenter.resign(chat.id)

        XCTAssertEqual(presenter.host?.id, task.id)

        presenter.resign(task.id)

        XCTAssertNil(presenter.host)
    }

    private func host() -> ComposerPortalHost {
        ComposerPortalHost(
            id: UUID(),
            interaction: ComposerInteraction(),
            transitionNamespace: Namespace().wrappedValue,
            colorScheme: .dark
        )
    }
}
