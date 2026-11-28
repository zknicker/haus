import Foundation
import XCTest
@testable import HausModels

/// Each focused stream's payload decodes from the Server's wire shape
/// (`packages/haus-api/src/{chat-events,claim,cloud-agent}.ts`).
final class RealtimeEventsTests: XCTestCase {
    func testDecodesMessageCreatedIgnoringFieldsItDoesNotRead() throws {
        let event = try decode(MessageCreatedEvent.self, """
        {"authorUserId":null,"chatId":"chat_1","conversationKind":"channel","mentionedUserIds":["user_2"],
         "messageId":"m9","parentChatId":null,"replyToAuthorUserId":null,"sequence":9,"serverId":"server_1",
         "futureField":true}
        """)

        XCTAssertEqual(event, MessageCreatedEvent(serverID: "server_1", chatID: "chat_1", messageID: "m9", sequence: 9))
    }

    func testDecodesServerUpdated() throws {
        let event = try decode(ServerUpdatedEvent.self, #"{"serverId":"server_1"}"#)
        XCTAssertEqual(event, ServerUpdatedEvent(serverID: "server_1"))
    }

    func testDecodesComputerUpdated() throws {
        let named = try decode(ComputerUpdatedEvent.self, #"{"computerId":"cmp_1","serverId":"server_1"}"#)
        XCTAssertEqual(named, ComputerUpdatedEvent(computerID: "cmp_1", serverID: "server_1"))
        let broad = try decode(ComputerUpdatedEvent.self, #"{"computerId":null,"serverId":"server_1"}"#)
        XCTAssertEqual(broad, ComputerUpdatedEvent(computerID: nil, serverID: "server_1"))
    }

    func testDecodesReactionUpdated() throws {
        let event = try decode(MessageReactionUpdatedEvent.self, """
        {"chatId":"chat_1","messageId":"m1","parentChatId":null,"serverId":"server_1"}
        """)
        XCTAssertEqual(event, MessageReactionUpdatedEvent(serverID: "server_1", chatID: "chat_1", messageID: "m1"))
    }

    func testDecodesARead() throws {
        let event = try decode(ChatReadEvent.self, """
        {"chatId":"chat_1","parentChatId":null,"sequence":4,"serverId":"server_1","taskId":null}
        """)
        XCTAssertEqual(event, ChatReadEvent(serverID: "server_1", chatID: "chat_1", sequence: 4))
    }

    func testDecodesEveryLifecycleAction() throws {
        for action in ["archived", "created", "deleted", "unarchived", "updated"] {
            let event = try decode(ChatLifecycleEvent.self, """
            {"action":"\(action)","chatId":"chat_1","serverId":"server_1"}
            """)
            XCTAssertEqual(event.action.rawValue, action)
        }
    }

    func testDecodesClaimChanged() throws {
        let claim = try decode(ClaimChangedEvent.self, """
        {"chatId":"chat_1","kind":"updated","messageId":"m1","serverId":"server_1"}
        """)
        XCTAssertEqual(claim, ClaimChangedEvent(serverID: "server_1", chatID: "chat_1", messageID: "m1", kind: .updated))
    }

    func testDecodesTheChatMessageEntityAndItsNullAnswer() throws {
        let json = """
        {"message":{"attachments":[],"author":{"agentId":"agent_1","kind":"agent"},"chatId":"chat_1",
         "content":"hi","createdAt":"2026-01-01T00:00:00Z","id":"m1","nonce":"n1","runId":null,
         "sequence":1,"serverId":"server_1"},"tasks":[]}
        """
        let entity = try decode(ChatMessageEntity?.self, json)
        XCTAssertEqual(entity?.message.id, "m1")
        XCTAssertEqual(entity?.tasks, [])
        XCTAssertNil(try decode(ChatMessageEntity?.self, "null"))
    }

    func testAPageWithoutItsScanPositionIsRejected() {
        XCTAssertThrowsError(try decode(ChatMessagePage.self, """
        {"messages":[],"nextBeforeSequence":null,"nextAfterSequence":null}
        """))
        XCTAssertEqual(try decode(ChatMessagePage.self, """
        {"messages":[],"nextBeforeSequence":null,"nextAfterSequence":null,"scannedThroughSequence":12}
        """).scannedThroughSequence, 12)
    }

    func testAPageIgnoresKeysItDoesNotRead() throws {
        let page = try decode(ChatMessagePage.self, """
        {"messages":[],"nextBeforeSequence":null,"nextAfterSequence":null,"scannedThroughSequence":3,
         "summaries":[{"anchorMessageId":"m1"}],"tasks":[]}
        """)
        XCTAssertEqual(page.scannedThroughSequence, 3)
        XCTAssertEqual(page.tasks, [])
    }

    private func decode<Value: Decodable>(_ type: Value.Type, _ json: String) throws -> Value {
        try HausJSON.decoder().decode(type, from: Data(json.utf8))
    }
}

/// Each event kind's handler records exactly the reads the spec assigns it.
final class ChatRealtimeEffectsTests: XCTestCase {
    func testAMessageTailsItsChatAndRefreshesTheChatList() {
        let effects = ChatRealtimeEffects([
            .messageCreated(.init(serverID: "s", chatID: "chat_1", messageID: "m2", sequence: 2)),
            .messageCreated(.init(serverID: "s", chatID: "chat_1", messageID: "m3", sequence: 3)),
        ], serverID: "s")

        XCTAssertEqual(effects.tailSequenceByChatID, ["chat_1": 3])
        XCTAssertTrue(effects.entityRefreshes.isEmpty)
        XCTAssertTrue(effects.reloadsChatList)
    }

    func testAnInlineReplyTailsItsChannelAlone() {
        let effects = ChatRealtimeEffects([
            .messageCreated(.init(serverID: "s", chatID: "chat_1", messageID: "r1", sequence: 7)),
        ], serverID: "s")

        XCTAssertEqual(effects.tailSequenceByChatID, ["chat_1": 7])
        XCTAssertTrue(effects.entityRefreshes.isEmpty)
    }

    func testAnnotationEventsRefreshOneEntityEach() {
        let effects = ChatRealtimeEffects([
            .reactionUpdated(.init(serverID: "s", chatID: "chat_1", messageID: "m1")),
            .reactionUpdated(.init(serverID: "s", chatID: "chat_1", messageID: "m1")),
            .claimChanged(.init(serverID: "s", chatID: "chat_1", messageID: "m2", kind: .created)),
        ], serverID: "s")

        XCTAssertEqual(effects.entityRefreshes, [
            EntityRefresh(chatID: "chat_1", messageID: "m1"),
            EntityRefresh(chatID: "chat_1", messageID: "m2"),
        ])
        XCTAssertTrue(effects.changedTaskIDs.isEmpty)
        XCTAssertTrue(effects.tailSequenceByChatID.isEmpty)
        XCTAssertEqual(effects.liveReactionMessageIDs, ["m1"])
    }

    func testTaskEventsNameEachChangedTaskOnce() {
        let effects = ChatRealtimeEffects([
            .taskChanged(.init(serverID: "s", taskID: "task_1", version: 2)),
            .taskChanged(.init(serverID: "s", taskID: "task_1", version: 3)),
            .taskChanged(.init(serverID: "s", taskID: "task_2", chatID: "chat_task_2", version: 5)),
        ], serverID: "s")

        XCTAssertEqual(effects.changedTaskIDs, ["task_1", "task_2"])
        XCTAssertEqual(effects.taskIDsToRefreshPreview, ["task_1", "task_2"])
        XCTAssertTrue(effects.reloadsUnreadTasks)
        XCTAssertFalse(effects.needsChatListRead { _ in nil })
    }

    func testTaskEventsDecodeTheServerPayloads() throws {
        let task = try HausJSON.decoder().decode(
            TaskChangedEvent.self,
            from: Data(#"{"boardId":"b","chatId":null,"serverId":"s","taskId":"t","version":4}"#.utf8)
        )
        XCTAssertEqual(task, TaskChangedEvent(serverID: "s", taskID: "t", version: 4))
    }

    func testAReadSkipsTheChatListWhenItAlreadyShowsNothingUnread() {
        let effects = ChatRealtimeEffects([
            .read(.init(serverID: "s", chatID: "chat_1", sequence: 4)),
        ], serverID: "s")

        XCTAssertFalse(effects.needsChatListRead { _ in 0 })
        XCTAssertTrue(effects.needsChatListRead { _ in 2 })
        XCTAssertTrue(effects.needsChatListRead { _ in nil })
    }

    func testATaskReadReloadsUnreadTasksNotTheChatList() {
        let effects = ChatRealtimeEffects([
            .read(.init(serverID: "s", chatID: "chat_task_1", sequence: 4, taskID: "task_1")),
        ], serverID: "s")

        XCTAssertTrue(effects.readChatIDs.isEmpty)
        XCTAssertTrue(effects.reloadsUnreadTasks)
        XCTAssertEqual(effects.taskIDsToRefreshPreview, ["task_1"])
        XCTAssertFalse(effects.needsChatListRead { _ in 2 })
    }

    func testAChatReadNamesItsChat() {
        let effects = ChatRealtimeEffects([
            .read(.init(serverID: "s", chatID: "chat_1", sequence: 4)),
        ], serverID: "s")

        XCTAssertEqual(effects.readChatIDs, ["chat_1"])
        XCTAssertFalse(effects.reloadsUnreadTasks)
    }

    func testDeletionPurgesAndRereadsTheChatList() {
        let effects = ChatRealtimeEffects([
            .lifecycle(.init(serverID: "s", chatID: "chat_1", action: .deleted)),
            .lifecycle(.init(serverID: "s", chatID: "chat_2", action: .updated)),
        ], serverID: "s")

        XCTAssertEqual(effects.deletedChatIDs, ["chat_1"])
        XCTAssertTrue(effects.entityRefreshes.isEmpty)
        XCTAssertTrue(effects.reloadsChatList)
    }

    func testAnotherServersEventsAreIgnored() {
        let effects = ChatRealtimeEffects([
            .messageCreated(.init(serverID: "other", chatID: "chat_1", messageID: "m1", sequence: 1)),
        ], serverID: "s")
        XCTAssertTrue(effects.isEmpty)
    }
}
