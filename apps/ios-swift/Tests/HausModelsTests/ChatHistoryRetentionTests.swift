import XCTest
@testable import HausModels

final class ChatHistoryRetentionTests: XCTestCase {
    func testTouchBuildsAnLRUOrderAndMovesExistingChatToNewest() {
        var retention = ChatHistoryRetention(capacity: 3)

        retention.touch("chat-a")
        retention.touch("chat-b")
        retention.touch("chat-c")
        retention.touch("chat-a")

        XCTAssertEqual(retention.orderedChatIDs, ["chat-b", "chat-c", "chat-a"])
    }

    func testRemovalDropsChatFromPolicy() {
        var retention = ChatHistoryRetention(capacity: 3)
        retention.touch("chat-a")
        retention.touch("chat-b")

        retention.remove("chat-a")

        XCTAssertEqual(retention.orderedChatIDs, ["chat-b"])
    }

    func testEvictionsRespectLRUOrderAndProtectedChats() {
        var retention = ChatHistoryRetention(capacity: 3)
        retention.touch("chat-a")
        retention.touch("chat-b")
        retention.touch("chat-c")
        retention.touch("chat-d")

        let evicted = retention.evictions(
            cachedIDs: ["chat-a", "chat-b", "chat-c", "chat-d"],
            protectedIDs: ["chat-a"]
        )

        XCTAssertEqual(evicted, ["chat-b"])
        XCTAssertEqual(retention.orderedChatIDs, ["chat-a", "chat-c", "chat-d"])
    }

    func testEvictionsAdmitUnknownCachedIDsDeterministicallyAndProtectInflightChats() {
        var retention = ChatHistoryRetention(capacity: 2)
        retention.touch("chat-z")

        let evicted = retention.evictions(
            cachedIDs: ["chat-a", "chat-b", "chat-z"],
            protectedIDs: ["chat-a", "chat-b"]
        )

        XCTAssertEqual(evicted, ["chat-z"])
        XCTAssertEqual(retention.orderedChatIDs, ["chat-a", "chat-b"])
    }

    func testEvictionsSynchronizeRemovedCachedIDsBeforeSelectingCandidates() {
        var retention = ChatHistoryRetention(capacity: 2)
        retention.touch("chat-removed")
        retention.touch("chat-live")
        retention.touch("chat-new")

        let evicted = retention.evictions(
            cachedIDs: ["chat-live", "chat-new", "chat-latest"],
            protectedIDs: []
        )

        XCTAssertEqual(evicted, ["chat-live"])
        XCTAssertEqual(retention.orderedChatIDs, ["chat-new", "chat-latest"])
    }
}
