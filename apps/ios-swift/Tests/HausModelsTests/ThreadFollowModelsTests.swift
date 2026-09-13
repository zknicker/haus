import Foundation
import XCTest
@testable import HausModels

final class ThreadFollowModelsTests: XCTestCase {
    func testFollowInputUsesServerContractWireNames() throws {
        let input = ThreadFollowInput(
            follow: true,
            serverID: "srv_main",
            threadChatID: "cht_thread"
        )
        let object = try XCTUnwrap(
            JSONSerialization.jsonObject(with: JSONEncoder().encode(input)) as? [String: Any]
        )

        XCTAssertEqual(Set(object.keys), ["follow", "serverId", "threadChatId"])
        XCTAssertEqual(object["follow"] as? Bool, true)
        XCTAssertEqual(object["serverId"] as? String, "srv_main")
        XCTAssertEqual(object["threadChatId"] as? String, "cht_thread")
    }

    func testFollowReceiptDecodesServerPayload() throws {
        let receipt = try JSONDecoder().decode(
            ThreadFollowReceipt.self,
            from: Data(
                #"{"eventCursor":"42","followed":false,"serverId":"srv_main","threadChatId":"cht_thread"}"#
                    .utf8
            )
        )

        XCTAssertEqual(receipt, ThreadFollowReceipt(
            eventCursor: "42",
            followed: false,
            serverID: "srv_main",
            threadChatID: "cht_thread"
        ))
    }

    func testFollowedReadsTheNamedThreadOnly() {
        let page = Self.page(followed: true)

        XCTAssertEqual(ThreadFollowPatch.followed(threadChatID: "cht_thread", in: page), true)
        XCTAssertEqual(ThreadFollowPatch.followed(threadChatID: "cht_other", in: page), false)
        XCTAssertNil(ThreadFollowPatch.followed(threadChatID: "cht_missing", in: page))
        XCTAssertNil(ThreadFollowPatch.followed(threadChatID: "cht_thread", in: nil))
    }

    func testPatchSetsOneThreadAndLeavesTheRestAlone() throws {
        let page = Self.page(followed: true)

        let patched = try XCTUnwrap(
            ThreadFollowPatch.page(page, followed: false, threadChatID: "cht_thread")
        )

        XCTAssertEqual(ThreadFollowPatch.followed(threadChatID: "cht_thread", in: patched), false)
        XCTAssertEqual(ThreadFollowPatch.followed(threadChatID: "cht_other", in: patched), false)
        XCTAssertEqual(patched.messages, page.messages)
        XCTAssertEqual(patched.nextBeforeSequence, page.nextBeforeSequence)
        XCTAssertEqual(patched.threads.map(\.threadChatID), page.threads.map(\.threadChatID))
        XCTAssertEqual(patched.threads.map(\.replyCount), page.threads.map(\.replyCount))
    }

    /// The rollback path: the value the press replaced goes back on the page.
    func testPatchRestoresThePreviousValue() throws {
        let page = Self.page(followed: true)
        let previous = try XCTUnwrap(
            ThreadFollowPatch.followed(threadChatID: "cht_thread", in: page)
        )
        let optimistic = try XCTUnwrap(
            ThreadFollowPatch.page(page, followed: false, threadChatID: "cht_thread")
        )

        let rolledBack = try XCTUnwrap(
            ThreadFollowPatch.page(optimistic, followed: previous, threadChatID: "cht_thread")
        )

        XCTAssertEqual(rolledBack, page)
    }

    func testPatchIsNilWhenThereIsNothingToChange() {
        let page = Self.page(followed: true)

        XCTAssertNil(ThreadFollowPatch.page(page, followed: true, threadChatID: "cht_thread"))
        XCTAssertNil(ThreadFollowPatch.page(page, followed: true, threadChatID: "cht_missing"))
        XCTAssertNil(ThreadFollowPatch.page(nil, followed: true, threadChatID: "cht_thread"))
    }

    private static func page(followed: Bool) -> ChatMessagePage {
        ChatMessagePage(
            messages: [],
            nextBeforeSequence: 7,
            threads: [
                summary(anchorMessageID: "msg_anchor", threadChatID: "cht_thread", followed: followed),
                summary(anchorMessageID: "msg_other", threadChatID: "cht_other", followed: false),
            ]
        )
    }

    private static func summary(
        anchorMessageID: String,
        threadChatID: String,
        followed: Bool
    ) -> ThreadSummary {
        ThreadSummary(
            anchorMessageID: anchorMessageID,
            followed: followed,
            latestReplyAt: nil,
            recentReplies: [],
            replyCount: 3,
            threadChatID: threadChatID,
            unreadCount: 0
        )
    }
}
