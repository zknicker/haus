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
            from: Data(#"{"followed":false,"serverId":"srv_main","threadChatId":"cht_thread"}"#.utf8)
        )

        XCTAssertEqual(receipt, ThreadFollowReceipt(
            followed: false,
            serverID: "srv_main",
            threadChatID: "cht_thread"
        ))
    }

    func testFollowedReadsTheNamedThreadOnly() {
        let page = Self.page(followed: true)

        XCTAssertEqual(ThreadFollowState.followed(threadChatID: "cht_thread", in: page), true)
        XCTAssertEqual(ThreadFollowState.followed(threadChatID: "cht_other", in: page), false)
        XCTAssertNil(ThreadFollowState.followed(threadChatID: "cht_missing", in: page))
        XCTAssertNil(ThreadFollowState.followed(threadChatID: "cht_thread", in: nil))
    }

    private static func page(followed: Bool) -> ChatMessagePage {
        ChatMessagePage(
            messages: [],
            nextBeforeSequence: 7,
            nextAfterSequence: 8,
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
