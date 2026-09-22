import XCTest
@testable import HausModels

final class ChatHistoryRequestsTests: XCTestCase {
    func testRefreshCannotOverwriteANewerNavigation() throws {
        var requests = ChatHistoryRequests()
        let refresh = try XCTUnwrap(
            requests.begin(chatID: "chat", policy: .refresh)
        )
        let navigation = try XCTUnwrap(
            requests.begin(chatID: "chat", policy: .navigate)
        )

        XCTAssertNotEqual(refresh, navigation)
        XCTAssertNil(requests.finish(refresh, chatID: "chat"))
        XCTAssertTrue(requests.isCurrent(navigation, chatID: "chat"))
    }

    func testAnOldFinishDoesNotClearTheNewRequest() throws {
        var requests = ChatHistoryRequests()
        let old = try XCTUnwrap(
            requests.begin(chatID: "chat", policy: .navigate)
        )
        let new = try XCTUnwrap(
            requests.begin(chatID: "chat", policy: .navigate)
        )

        XCTAssertNil(requests.finish(old, chatID: "chat"))
        XCTAssertTrue(requests.isCurrent(new, chatID: "chat"))
        XCTAssertEqual(requests.finish(new, chatID: "chat"), false)
    }

    func testMultipleRefreshesCoalesceBehindOneActiveRequest() throws {
        var requests = ChatHistoryRequests()
        let first = try XCTUnwrap(
            requests.begin(chatID: "chat", policy: .refresh)
        )

        XCTAssertNil(requests.begin(chatID: "chat", policy: .refresh))
        XCTAssertNil(requests.begin(chatID: "chat", policy: .refresh))
        XCTAssertEqual(requests.finish(first, chatID: "chat"), true)

        let deferred = try XCTUnwrap(
            requests.begin(chatID: "chat", policy: .refresh)
        )
        XCTAssertEqual(requests.finish(deferred, chatID: "chat"), false)
    }

    func testPageRequestsRefuseBusyChatsButDifferentChatsProceed() throws {
        var requests = ChatHistoryRequests()
        let first = try XCTUnwrap(
            requests.begin(chatID: "chat-a", policy: .page)
        )

        XCTAssertNil(requests.begin(chatID: "chat-a", policy: .page))
        let second = try XCTUnwrap(
            requests.begin(chatID: "chat-b", policy: .page)
        )

        XCTAssertTrue(requests.isCurrent(first, chatID: "chat-a"))
        XCTAssertTrue(requests.isCurrent(second, chatID: "chat-b"))
        XCTAssertEqual(requests.finish(first, chatID: "chat-a"), false)
        XCTAssertEqual(requests.finish(second, chatID: "chat-b"), false)
    }

    func testNavigationClearsAQueuedRefresh() throws {
        var requests = ChatHistoryRequests()
        let refresh = try XCTUnwrap(
            requests.begin(chatID: "chat", policy: .refresh)
        )
        XCTAssertNil(requests.begin(chatID: "chat", policy: .refresh))

        let navigation = try XCTUnwrap(
            requests.begin(chatID: "chat", policy: .navigate)
        )

        XCTAssertNil(requests.finish(refresh, chatID: "chat"))
        XCTAssertEqual(requests.finish(navigation, chatID: "chat"), false)
    }
}
