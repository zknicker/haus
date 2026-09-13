import XCTest
@testable import HausUI

final class ThreadFollowPresentationTests: XCTestCase {
    /// The App's Thread header item states the action, not the state, and the
    /// phone's bar item carries the same words and the same pair of bells.
    func testFollowedThreadOffersToStopFollowing() {
        let presentation = ThreadFollowPresentation.make(followed: true)

        XCTAssertEqual(presentation.title, "Stop following thread")
        XCTAssertEqual(presentation.icon, .notificationOff)
        XCTAssertFalse(presentation.nextFollow)
    }

    func testUnfollowedThreadOffersToFollow() {
        let presentation = ThreadFollowPresentation.make(followed: false)

        XCTAssertEqual(presentation.title, "Follow thread")
        XCTAssertEqual(presentation.icon, .notification)
        XCTAssertTrue(presentation.nextFollow)
    }
}
