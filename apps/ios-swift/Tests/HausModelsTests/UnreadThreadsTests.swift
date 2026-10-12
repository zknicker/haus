import Foundation
import XCTest
@testable import HausModels

/// `thread.listUnread` rows as the Inbox and its dot read them (ADR 0043).
final class UnreadThreadsTests: XCTestCase {
    func testDecodesTheServerRow() throws {
        let list = try HausJSON.decoder().decode(UnreadThreadList.self, from: Data(Self.listJSON.utf8))
        let thread = try XCTUnwrap(list.threads.first)

        XCTAssertEqual(thread.id, "thread_1")
        XCTAssertEqual(thread.parentChatID, "chat_1")
        XCTAssertEqual(thread.anchorMessageID, "anchor_1")
        XCTAssertEqual(thread.firstUnreadMessageID, "reply_3")
        XCTAssertEqual(thread.firstUnreadSequence, 3)
        XCTAssertEqual(thread.lastMessageSequence, 5)
        XCTAssertEqual(thread.unreadCount, 2)
        XCTAssertEqual(thread.latestReply?.authorDisplayName, "Blippy")
        XCTAssertNotNil(thread.lastActivityAt)
    }

    /// A Thread whose parent the Chat list does not hold waits for it, so the
    /// dot never counts a row the section hides.
    func testHidesAThreadWhoseParentIsNotListed() {
        let threads = [thread(id: "t1", parent: "listed"), thread(id: "t2", parent: "missing")]

        let visible = UnreadThreads.visible(threads, parentChatIDs: ["listed"], markedReadThrough: [:])

        XCTAssertEqual(visible.map(\.id), ["t1"])
    }

    /// Mark read hides the row at once; only a newer reply brings it back.
    func testMarkReadHidesTheThreadUntilANewerReply() {
        let waiting = thread(id: "t1", parent: "chat", lastSequence: 5)
        let newer = thread(id: "t1", parent: "chat", lastSequence: 6)

        XCTAssertFalse(UnreadThreads.isUnread(waiting, markedReadThrough: ["t1": 5]))
        XCTAssertTrue(UnreadThreads.isUnread(newer, markedReadThrough: ["t1": 5]))
        XCTAssertTrue(UnreadThreads.isUnread(waiting, markedReadThrough: ["chat": 9]))
    }

    private func thread(id: String, parent: String, lastSequence: Int = 5) -> UnreadThread {
        UnreadThread(
            anchorMessageID: "anchor_\(id)",
            firstUnreadMessageID: "reply_\(id)",
            firstUnreadSequence: 1,
            lastActivityAt: nil,
            latestReply: nil,
            lastMessageSequence: lastSequence,
            parentChatID: parent,
            serverID: "server_1",
            threadChatID: id,
            unreadCount: 1
        )
    }

    private static let listJSON = """
    {"threads":[{"anchorMessageId":"anchor_1","firstUnreadMessageId":"reply_3",
     "firstUnreadSequence":3,"lastActivityAt":"2026-10-11T09:00:00.000Z",
     "latestReply":{"authorDisplayName":"Blippy","content":"Done","createdAt":"2026-10-11T09:00:00.000Z"},
     "lastMessageSequence":5,"parentChatId":"chat_1","serverId":"server_1",
     "threadChatId":"thread_1","unreadCount":2}]}
    """
}
