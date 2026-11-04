import Foundation
import XCTest
@testable import HausModels

final class ClaimModelsTests: XCTestCase {
    func testClaimListInputOmitsOptionalChatFilter() throws {
        let input = ClaimListInput(serverID: "server_1")
        let data = try JSONEncoder().encode(input)
        let object = try XCTUnwrap(
            JSONSerialization.jsonObject(with: data) as? [String: Any]
        )

        XCTAssertEqual(object["serverId"] as? String, "server_1")
        XCTAssertNil(object["chatId"])
    }

    func testClaimListInputEncodesBackgroundWideningOnlyWhenRequested() throws {
        let input = ClaimListInput(serverID: "server_1", includeBackground: true)
        let data = try JSONEncoder().encode(input)
        let object = try XCTUnwrap(
            JSONSerialization.jsonObject(with: data) as? [String: Any]
        )

        XCTAssertEqual(object["includeBackground"] as? Bool, true)

        let narrow = try JSONEncoder().encode(ClaimListInput(serverID: "server_1"))
        let narrowObject = try XCTUnwrap(
            JSONSerialization.jsonObject(with: narrow) as? [String: Any]
        )

        XCTAssertNil(narrowObject["includeBackground"])
    }

    func testClaimMutationInputsUseServerWireNames() throws {
        let input = ClaimUpdateInput(
            serverID: "server_1",
            messageID: "message_1",
            expectedVersion: 3,
            patch: ClaimUpdatePatch(status: .inReview)
        )
        let data = try JSONEncoder().encode(input)
        let object = try XCTUnwrap(
            JSONSerialization.jsonObject(with: data) as? [String: Any]
        )
        let patch = try XCTUnwrap(object["patch"] as? [String: Any])

        XCTAssertEqual(object["serverId"] as? String, "server_1")
        XCTAssertEqual(object["messageId"] as? String, "message_1")
        XCTAssertEqual(object["expectedVersion"] as? Int, 3)
        XCTAssertEqual(patch["status"] as? String, "in_review")
        XCTAssertNil(patch["priority"])
    }

    func testDecodesClaimListProjectionWithCanonicalMessageAndThread() throws {
        let item = try HausJSON.decoder().decode(
            ClaimListItem.self,
            from: Data(
                """
                {"chatKind":"dm","chatName":null,"chatPeerUserId":"user_2",
                 "message":{"attachments":[],"author":{"kind":"human","userId":"user_1","profile":null},"chatId":"chat_1","content":"Review the mobile release","createdAt":"2026-01-01T00:00:00Z","id":"message_1","nonce":"nonce_1","runId":null,"sequence":8,"serverId":"server_1","claim":null},
                 "claim":{"assigneeAgentId":"agent_1","chatId":"chat_1","claimedAt":null,"createdAt":"2026-01-01T00:00:00Z","createdByAgentId":null,"createdByUserId":"user_1","labels":[],"live":false,"messageId":"message_1","number":4,"origin":"converted","priority":"urgent","status":"in_review","threadChatId":"thread_1","tier":"tracked","updatedAt":"2026-01-01T00:01:00Z","version":6},
                 "threadSummary":{"anchorMessageId":"message_1","followed":true,"latestReplyAt":"2026-01-01T00:02:00Z","recentReplies":[],"replyCount":2,"threadChatId":"thread_1","unreadCount":1}}
                """.utf8
            )
        )

        XCTAssertEqual(item.id, "message_1")
        XCTAssertEqual(item.claim.status, .inReview)
        XCTAssertEqual(item.claim.priority, .urgent)
        XCTAssertEqual(item.threadSummary.replyCount, 2)
        XCTAssertEqual(item.chatPeerUserID, "user_2")
    }

    func testDecodesClaimListEnvelopeWithHiddenBackgroundCount() throws {
        let list = try HausJSON.decoder().decode(
            ClaimList.self,
            from: Data(
                """
                {"backgroundCount":2,"claims":[
                 {"chatKind":"channel","chatName":"product","chatPeerUserId":null,
                  "message":{"attachments":[],"author":{"kind":"human","userId":"user_1","profile":null},"chatId":"chat_1","content":"Ship the release","createdAt":"2026-01-01T00:00:00Z","id":"message_1","nonce":"nonce_1","runId":null,"sequence":8,"serverId":"server_1","claim":null},
                  "claim":{"assigneeAgentId":"agent_1","chatId":"chat_1","claimedAt":"2026-01-01T00:01:00Z","createdAt":"2026-01-01T00:00:00Z","createdByAgentId":"agent_1","createdByUserId":null,"labels":[],"live":true,"messageId":"message_1","number":4,"origin":"claimed","priority":"none","status":"in_progress","threadChatId":"thread_1","tier":"tracked","updatedAt":"2026-01-01T00:01:00Z","version":6},
                  "threadSummary":{"anchorMessageId":"message_1","followed":true,"latestReplyAt":null,"recentReplies":[],"replyCount":0,"threadChatId":"thread_1","unreadCount":0}}]}
                """.utf8
            )
        )

        XCTAssertEqual(list.backgroundCount, 2)
        XCTAssertEqual(list.claims.count, 1)
        XCTAssertEqual(list.claims[0].claim.origin, .claimed)
        XCTAssertEqual(list.claims[0].claim.tier, .tracked)
        XCTAssertTrue(list.claims[0].claim.live)
    }

    func testDecodesBackgroundTierClaimWhenTheLensIsWidened() throws {
        let list = try HausJSON.decoder().decode(
            ClaimList.self,
            from: Data(
                """
                {"backgroundCount":0,"claims":[
                 {"chatKind":"dm","chatName":null,"chatPeerUserId":"user_2",
                  "message":{"attachments":[],"author":{"kind":"human","userId":"user_1","profile":null},"chatId":"chat_1","content":"Check the log","createdAt":"2026-01-01T00:00:00Z","id":"message_2","nonce":"nonce_2","runId":null,"sequence":9,"serverId":"server_1","claim":null},
                  "claim":{"assigneeAgentId":"agent_1","chatId":"chat_1","claimedAt":"2026-01-01T00:00:30Z","createdAt":"2026-01-01T00:00:00Z","createdByAgentId":"agent_1","createdByUserId":null,"labels":[],"live":false,"messageId":"message_2","number":5,"origin":"claimed","priority":"none","status":"done","threadChatId":"thread_2","tier":"background","updatedAt":"2026-01-01T00:02:00Z","version":2},
                  "threadSummary":{"anchorMessageId":"message_2","followed":false,"latestReplyAt":null,"recentReplies":[],"replyCount":0,"threadChatId":"thread_2","unreadCount":0}}]}
                """.utf8
            )
        )

        XCTAssertEqual(list.backgroundCount, 0)
        XCTAssertEqual(list.claims[0].claim.tier, .background)
        XCTAssertFalse(list.claims[0].claim.live)
    }
}
