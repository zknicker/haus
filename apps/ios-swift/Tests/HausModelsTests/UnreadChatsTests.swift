import Foundation
import XCTest
@testable import HausModels

/// The one unread rule the Inbox section, the sidebar dot, and the badge share.
final class UnreadChatsTests: XCTestCase {
    func testListsOnlyChatsTheServerCountsUnread() throws {
        let chats = try [
            chat(id: "waiting", unreadCount: 2, lastMessageSequence: 9),
            chat(id: "read", unreadCount: 0, lastMessageSequence: 4),
        ]

        XCTAssertEqual(UnreadChats.visible(chats, markedReadThrough: [:]).map(\.id), ["waiting"])
    }

    /// Mark read hides the Chat at once, before the Server answers.
    func testMarkReadHidesTheChatOptimistically() throws {
        let waiting = try chat(id: "waiting", unreadCount: 2, lastMessageSequence: 9)

        XCTAssertFalse(UnreadChats.isUnread(waiting, markedReadThrough: ["waiting": 9]))
        XCTAssertTrue(UnreadChats.isUnread(waiting, markedReadThrough: ["other": 9]))
    }

    /// A message newer than the one Mark read covered brings the Chat back
    /// even while the mutation is still settling.
    func testANewerMessageBringsTheChatBack() throws {
        let newer = try chat(id: "waiting", unreadCount: 3, lastMessageSequence: 10)

        XCTAssertTrue(UnreadChats.isUnread(newer, markedReadThrough: ["waiting": 9]))
    }

    private func chat(id: String, unreadCount: Int, lastMessageSequence: Int) throws -> ChatSummary {
        let json = """
        {"archivedAt":null,"archivedByUserId":null,"color":null,
         "createdAt":"2026-09-01T00:00:00Z","icon":null,"id":"\(id)","isAll":false,
         "kind":"channel","lastActivityAt":"2026-09-11T09:00:00.000Z","lastMessage":null,
         "lastMessageSequence":\(lastMessageSequence),"name":"\(id)","participantAgentIds":[],
         "participantUserIds":["user_1"],"peerAgentDisplayName":null,"peerAgentId":null,
         "peerAgentRetired":false,"peerUserId":null,"serverId":"server_1",
         "unreadCount":\(unreadCount)}
        """
        return try HausJSON.decoder().decode(ChatSummary.self, from: Data(json.utf8))
    }
}
