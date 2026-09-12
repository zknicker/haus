import XCTest
@testable import HausModels

final class TaskVisibilityTests: XCTestCase {
    func testHidesAnAgentsOwnClaimByDefault() {
        XCTAssertFalse(TaskVisibility.visibleInChat(origin: .claimed, showTasksInChat: false))
    }

    func testShowsAClaimOnceTheReaderAsksForTasks() {
        XCTAssertTrue(TaskVisibility.visibleInChat(origin: .claimed, showTasksInChat: true))
    }

    func testAlwaysShowsATaskAHumanMade() {
        for origin in [TaskOrigin.composed, .converted] {
            XCTAssertTrue(TaskVisibility.visibleInChat(origin: origin, showTasksInChat: false))
            XCTAssertTrue(TaskVisibility.visibleInChat(origin: origin, showTasksInChat: true))
        }
    }
}
