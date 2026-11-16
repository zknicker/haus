import Foundation
import XCTest
@testable import HausModels

final class UtilityModelsTests: XCTestCase {
    func testEncodesChatSearchInputWithExactServerKeys() throws {
        let input = ChatSearchInput(
            query: "native realtime",
            serverID: "server_1",
            limit: 25,
            after: HausISO8601.date(from: "2026-08-15T14:00:00Z"),
            authorAgentID: "agent_1",
            chatID: "chat_1"
        )

        let json = try XCTUnwrap(
            JSONSerialization.jsonObject(
                with: HausJSON.encoder().encode(input)
            ) as? [String: Any]
        )

        XCTAssertEqual(json["query"] as? String, "native realtime")
        XCTAssertEqual(json["serverId"] as? String, "server_1")
        XCTAssertEqual(json["authorAgentId"] as? String, "agent_1")
        XCTAssertEqual(json["chatId"] as? String, "chat_1")
        XCTAssertEqual(json["limit"] as? Int, 25)
        XCTAssertEqual(json["after"] as? String, "2026-08-15T14:00:00.000Z")
        XCTAssertNil(json["authorUserId"])
    }

    func testEncodesServerScopesAndChannelCreationInput() throws {
        let scope = try JSONSerialization.jsonObject(
            with: HausJSON.encoder().encode(ChatScopeInput(chatID: "chat_1", serverID: "server_1"))
        ) as? [String: Any]
        XCTAssertEqual(scope?["chatId"] as? String, "chat_1")
        XCTAssertEqual(scope?["serverId"] as? String, "server_1")

        let archivedScope = try JSONSerialization.jsonObject(
            with: HausJSON.encoder().encode(ArchivedChatsInput(serverID: "server_1"))
        ) as? [String: Any]
        XCTAssertEqual(archivedScope?["serverId"] as? String, "server_1")

        let channel = try JSONSerialization.jsonObject(
            with: HausJSON.encoder().encode(
                CreateChannelInput(agentIDs: ["agent_1", "agent_2"], name: "planning", serverID: "server_1")
            )
        ) as? [String: Any]
        XCTAssertEqual(channel?["agentIds"] as? [String], ["agent_1", "agent_2"])
        XCTAssertEqual(channel?["name"] as? String, "planning")
        XCTAssertEqual(channel?["serverId"] as? String, "server_1")
    }

    func testDecodesSearchResultWithoutDuplicatingMessageProjection() throws {
        let json = """
        {
          "attachments": [],
          "author": {"kind":"human","userId":"user_1","profile":{"avatarUrl":null,"deleted":false,"description":null,"displayName":"Zach"}},
          "chatId":"chat_1",
          "chatArchivedAt":"2026-08-15T14:02:00Z",
          "content":"Native realtime is working.",
          "createdAt":"2026-08-15T14:00:00Z",
          "id":"message_1",
          "nonce":"nonce_1",
          "runId":null,
          "sequence":2,
          "serverId":"server_1",
          "claim":null
        }
        """

        let result = try HausJSON.decoder().decode(
            ChatSearchResult.self,
            from: Data(json.utf8)
        )

        XCTAssertEqual(result.id, "message_1")
        XCTAssertEqual(result.message.content, "Native realtime is working.")
        XCTAssertEqual(result.message.chatID, "chat_1")
        XCTAssertEqual(
            result.chatArchivedAt,
            HausISO8601.date(from: "2026-08-15T14:02:00Z")
        )
    }

    func testDecodesUnarchiveReceipt() throws {
        let receipt = try HausJSON.decoder().decode(
            ChatChannelLifecycleReceipt.self,
            from: Data(
                #"{"archivedAt":null,"chatId":"chat_1","serverId":"server_1"}"#.utf8
            )
        )

        XCTAssertNil(receipt.archivedAt)
        XCTAssertEqual(receipt.chatID, "chat_1")
        XCTAssertEqual(receipt.serverID, "server_1")
    }
}
