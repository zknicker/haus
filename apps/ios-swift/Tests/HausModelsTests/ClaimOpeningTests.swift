import Foundation
import XCTest
@testable import HausModels

/// Where opening a claim from the Tasks lens lands.
/// Where a stopped claim opens from the Agent profile.
final class ClaimOpeningTests: XCTestCase {
    func testATopLevelClaimOpensTheThreadAnchoredOnItsMessage() throws {
        let item = try claimListItem(
            messageID: "message_1",
            messageChatID: "chat_product",
            threadChatID: "cht_thr_message_1"
        )

        XCTAssertFalse(item.claim.sitsInThread(messageChatID: item.message.chatID))
        XCTAssertEqual(
            ClaimOpening(item),
            .anchoredThread(parentChatID: "chat_product", threadChatID: "cht_thr_message_1")
        )
    }

    /// Threads never nest: a claimed Thread message opens the Thread it sits
    /// in, under its Channel, and lands on the claim message rather than
    /// anchoring a Thread of its own.
    func testAThreadClaimOpensTheThreadItSitsInAndLandsOnItsMessage() throws {
        let item = try claimListItem(
            messageID: "message_reply",
            messageChatID: "cht_thr_message_anchor",
            threadChatID: "cht_thr_message_anchor"
        )

        XCTAssertTrue(item.claim.sitsInThread(messageChatID: item.message.chatID))
        XCTAssertEqual(
            ClaimOpening(item),
            .containingThread(
                parentChatID: "chat_product",
                threadChatID: "cht_thr_message_anchor",
                landingMessageID: "message_reply"
            )
        )
    }

    /// The row keeps naming the parent Channel, so the Tasks lens decodes a
    /// Thread claim without a Thread chat kind.
    func testDecodesAThreadClaimRowUnderItsParentChannel() throws {
        let item = try claimListItem(
            messageID: "message_reply",
            messageChatID: "cht_thr_message_anchor",
            threadChatID: "cht_thr_message_anchor"
        )

        XCTAssertEqual(item.chatKind, .channel)
        XCTAssertEqual(item.chatName, "product")
        XCTAssertEqual(item.claim.chatID, "chat_product")
    }

    private func claimListItem(
        messageID: String,
        messageChatID: String,
        threadChatID: String
    ) throws -> ClaimListItem {
        try HausJSON.decoder().decode(
            ClaimListItem.self,
            from: Data(
                """
                {"chatKind":"channel","chatName":"product","chatPeerUserId":null,
                 "message":{"attachments":[],"author":{"kind":"agent","agentId":"agent_1","profile":null},"chatId":"\(messageChatID)","content":"Pull the numbers","createdAt":"2026-01-01T00:00:00Z","id":"\(messageID)","nonce":"nonce_1","runId":null,"sequence":3,"serverId":"server_1","claim":null},
                 "claim":{"assigneeAgentId":"agent_1","chatId":"chat_product","claimedAt":"2026-01-01T00:00:10Z","createdAt":"2026-01-01T00:00:10Z","createdByAgentId":"agent_1","createdByUserId":null,"labels":[],"live":true,"messageId":"\(messageID)","number":12,"origin":"claimed","priority":"none","status":"in_progress","threadChatId":"\(threadChatID)","tier":"tracked","updatedAt":"2026-01-01T00:00:10Z","version":1},
                 "threadSummary":{"anchorMessageId":"message_anchor","followed":true,"latestReplyAt":null,"recentReplies":[],"replyCount":1,"threadChatId":"\(threadChatID)","unreadCount":0}}
                """.utf8
            )
        )
    }
}
