import Foundation
import XCTest
@testable import HausModels

final class ClaimModelsTests: XCTestCase {
    func testDecodesClaimListProjectionWithCanonicalMessageAndThread() throws {
        let item = try decodeItem(number: 4, status: "in_review")

        XCTAssertEqual(item.id, "message_4")
        XCTAssertEqual(item.claim.status, .inReview)
        XCTAssertEqual(item.threadSummary.replyCount, 2)
        XCTAssertEqual(item.chatKind, .channel)
        XCTAssertEqual(item.chatName, "product")
    }

    func testDecodesTheClaimListEnvelope() throws {
        let list = try HausJSON.decoder().decode(
            ClaimList.self,
            from: Data(#"{"backgroundCount":2,"claims":[\#(itemJSON())]}"#.utf8)
        )

        XCTAssertEqual(list.claims.count, 1)
        XCTAssertEqual(list.claims[0].claim.origin, .claimed)
        XCTAssertEqual(list.claims[0].claim.tier, .tracked)
    }

    // MARK: - Stopped claims

    func testSelectsOnlyTheClaimsAnAgentLeftUnfinished() throws {
        XCTAssertTrue(StoppedClaims.isStopped(try decodeItem().claim))
        XCTAssertFalse(StoppedClaims.isStopped(try decodeItem(live: true).claim))
        XCTAssertFalse(StoppedClaims.isStopped(try decodeItem(tier: "background").claim))
        XCTAssertFalse(StoppedClaims.isStopped(try decodeItem(origin: "converted").claim))
        XCTAssertFalse(StoppedClaims.isStopped(try decodeItem(status: "in_review").claim))
        XCTAssertFalse(StoppedClaims.isStopped(try decodeItem(status: "todo").claim))
    }

    func testAProfileListsOnlyItsOwnAgentsClaimsNewestFirst() throws {
        let items = [
            try decodeItem(number: 1, updatedAt: "2026-09-10T18:00:00.000Z"),
            try decodeItem(number: 2, updatedAt: "2026-09-11T18:00:00.000Z"),
            try decodeItem(number: 3, assignee: "agent_2"),
            try decodeItem(number: 4, live: true),
        ]

        XCTAssertEqual(StoppedClaims.held(by: "agent_1", in: items).map(\.claim.number), [2, 1])
        XCTAssertEqual(StoppedClaims.held(by: "agent_2", in: items).map(\.claim.number), [3])
        XCTAssertEqual(StoppedClaims.held(by: "agent_3", in: items), [])
    }

    private func decodeItem(
        number: Int = 4,
        status: String = "in_progress",
        origin: String = "claimed",
        tier: String = "tracked",
        live: Bool = false,
        assignee: String = "agent_1",
        updatedAt: String = "2026-09-10T18:30:00.000Z"
    ) throws -> ClaimListItem {
        try HausJSON.decoder().decode(ClaimListItem.self, from: Data(itemJSON(
            number: number,
            status: status,
            origin: origin,
            tier: tier,
            live: live,
            assignee: assignee,
            updatedAt: updatedAt
        ).utf8))
    }

    private func itemJSON(
        number: Int = 4,
        status: String = "in_progress",
        origin: String = "claimed",
        tier: String = "tracked",
        live: Bool = false,
        assignee: String = "agent_1",
        updatedAt: String = "2026-09-10T18:30:00.000Z"
    ) -> String {
        """
        {"chatKind":"channel","chatName":"product","chatPeerUserId":null,
         "message":{"attachments":[],"author":{"kind":"human","userId":"user_1","profile":null},"chatId":"chat_1","content":"Review the mobile release","createdAt":"2026-09-10T17:00:00Z","id":"message_\(number)","nonce":"nonce_1","runId":null,"sequence":8,"serverId":"server_1","claim":null},
         "claim":{"assigneeAgentId":"\(assignee)","chatId":"chat_1","claimedAt":"2026-09-10T18:00:00.000Z","createdAt":"2026-09-10T17:59:00.000Z","createdByAgentId":"agent_1","createdByUserId":null,"live":\(live),"messageId":"message_\(number)","number":\(number),"origin":"\(origin)","status":"\(status)","threadChatId":"thread_1","tier":"\(tier)","updatedAt":"\(updatedAt)","version":2},
         "threadSummary":{"anchorMessageId":"message_\(number)","followed":true,"latestReplyAt":"2026-09-10T18:02:00Z","recentReplies":[],"replyCount":2,"threadChatId":"thread_1","unreadCount":1}}
        """
    }
}
