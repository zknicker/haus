import Foundation
import XCTest
@testable import HausModels

/// Each focused stream's payload decodes from the Server's wire shape
/// (`packages/haus-api/src/{chat-events,task,cloud-agent}.ts`).
final class RealtimeEventsTests: XCTestCase {
    func testDecodesMessageCreatedIncludingAThreadReply() throws {
        let event = try decode(MessageCreatedEvent.self, """
        {"authorUserId":null,"chatId":"thread_1","conversationKind":"channel","mentionedUserIds":["user_2"],
         "messageId":"m9","parentChatId":"chat_1","replyToAuthorUserId":null,"sequence":9,"serverId":"server_1",
         "threadAnchorAuthorUserId":"user_1","threadAnchorMessageId":"anchor_1"}
        """)

        XCTAssertEqual(event, MessageCreatedEvent(
            serverID: "server_1", chatID: "thread_1", parentChatID: "chat_1",
            messageID: "m9", sequence: 9, threadAnchorMessageID: "anchor_1"
        ))
    }

    func testDecodesReactionUpdated() throws {
        let event = try decode(MessageReactionUpdatedEvent.self, """
        {"chatId":"chat_1","messageId":"m1","parentChatId":null,"serverId":"server_1"}
        """)
        XCTAssertEqual(event, MessageReactionUpdatedEvent(serverID: "server_1", chatID: "chat_1", messageID: "m1"))
    }

    func testDecodesAThreadReadWithItsAnchor() throws {
        let event = try decode(ChatReadEvent.self, """
        {"chatId":"thread_1","parentChatId":"chat_1","sequence":4,"serverId":"server_1","threadAnchorMessageId":"anchor_1"}
        """)
        XCTAssertEqual(event, ChatReadEvent(
            serverID: "server_1", chatID: "thread_1", parentChatID: "chat_1",
            sequence: 4, threadAnchorMessageID: "anchor_1"
        ))
    }

    func testDecodesThreadFollowUpdated() throws {
        let event = try decode(ThreadFollowUpdatedEvent.self, """
        {"anchorMessageId":"anchor_1","followed":true,"parentChatId":"chat_1","serverId":"server_1","threadChatId":"thread_1"}
        """)
        XCTAssertEqual(event.anchorMessageID, "anchor_1")
        XCTAssertTrue(event.followed)
    }

    func testDecodesEveryLifecycleAction() throws {
        for action in ["archived", "created", "deleted", "unarchived", "updated"] {
            let event = try decode(ChatLifecycleEvent.self, """
            {"action":"\(action)","chatId":"chat_1","serverId":"server_1"}
            """)
            XCTAssertEqual(event.action.rawValue, action)
        }
    }

    func testDecodesTaskChangedAndLabelUpdated() throws {
        let task = try decode(TaskChangedEvent.self, """
        {"chatId":"chat_1","kind":"updated","messageId":"m1","serverId":"server_1"}
        """)
        XCTAssertEqual(task, TaskChangedEvent(serverID: "server_1", chatID: "chat_1", messageID: "m1", kind: .updated))

        let label = try decode(TaskLabelUpdatedEvent.self, #"{"labelId":"label_1","serverId":"server_1"}"#)
        XCTAssertEqual(label, TaskLabelUpdatedEvent(serverID: "server_1", labelID: "label_1"))
    }

    func testDecodesCloudAgentWorkUpdated() throws {
        let event = try decode(CloudAgentWorkUpdatedEvent.self, """
        {"chatId":"thread_1","messageId":"m1","parentChatId":"chat_1","serverId":"server_1","workId":"work_1"}
        """)
        XCTAssertEqual(event, CloudAgentWorkUpdatedEvent(
            serverID: "server_1", chatID: "thread_1", parentChatID: "chat_1", messageID: "m1", workID: "work_1"
        ))
    }

    func testDecodesTheChatMessageEntityAndItsNullAnswer() throws {
        let json = """
        {"message":{"attachments":[],"author":{"agentId":"agent_1","kind":"agent"},"chatId":"chat_1",
         "content":"hi","createdAt":"2026-01-01T00:00:00Z","id":"m1","nonce":"n1","runId":null,
         "sequence":1,"serverId":"server_1"},
         "thread":{"anchorMessageId":"m1","followed":true,"latestReplyAt":null,"recentReplies":[],
         "replyCount":2,"threadChatId":"thread_m1","unreadCount":1}}
        """
        let entity = try decode(ChatMessageEntity?.self, json)
        XCTAssertEqual(entity?.message.id, "m1")
        XCTAssertEqual(entity?.thread?.replyCount, 2)
        XCTAssertNil(try decode(ChatMessageEntity?.self, "null"))
    }

    func testAPageWithoutItsScanPositionIsRejected() {
        XCTAssertThrowsError(try decode(ChatMessagePage.self, """
        {"messages":[],"nextBeforeSequence":null,"nextAfterSequence":null,"threads":[]}
        """))
        XCTAssertEqual(try decode(ChatMessagePage.self, """
        {"messages":[],"nextBeforeSequence":null,"nextAfterSequence":null,"scannedThroughSequence":12,"threads":[]}
        """).scannedThroughSequence, 12)
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

    func testAThreadReplyAlsoRefreshesItsParentAnchor() {
        let effects = ChatRealtimeEffects([
            .messageCreated(.init(
                serverID: "s", chatID: "thread_1", parentChatID: "chat_1",
                messageID: "r1", sequence: 1, threadAnchorMessageID: "anchor_1"
            )),
        ], serverID: "s")

        XCTAssertEqual(effects.tailSequenceByChatID, ["thread_1": 1])
        XCTAssertEqual(effects.entityRefreshes, [EntityRefresh(chatID: "chat_1", messageID: "anchor_1")])
    }

    func testAnnotationEventsRefreshOneEntityEach() {
        let effects = ChatRealtimeEffects([
            .reactionUpdated(.init(serverID: "s", chatID: "chat_1", messageID: "m1")),
            .reactionUpdated(.init(serverID: "s", chatID: "chat_1", messageID: "m1")),
            .taskChanged(.init(serverID: "s", chatID: "chat_1", messageID: "m2", kind: .created)),
            .cloudAgentWorkUpdated(.init(
                serverID: "s", chatID: "thread_1", parentChatID: "chat_1", messageID: "w1", workID: "work_1"
            )),
            .threadFollowUpdated(.init(
                serverID: "s", threadChatID: "thread_9", parentChatID: "chat_1", anchorMessageID: "anchor_9", followed: true
            )),
        ], serverID: "s")

        XCTAssertEqual(effects.entityRefreshes, [
            EntityRefresh(chatID: "chat_1", messageID: "m1"),
            EntityRefresh(chatID: "chat_1", messageID: "m2"),
            EntityRefresh(chatID: "thread_1", messageID: "w1"),
            EntityRefresh(chatID: "chat_1", messageID: "anchor_9"),
        ])
        XCTAssertTrue(effects.tailSequenceByChatID.isEmpty)
        XCTAssertEqual(effects.liveReactionMessageIDs, ["m1"])
        XCTAssertEqual(effects.cloudAgentWorkChatIDs, ["thread_1", "chat_1"])
        XCTAssertTrue(effects.reloadsServerTasks)
        XCTAssertTrue(effects.reloadsActiveCloudAgentWork)
    }

    func testAReadSkipsTheChatListWhenItAlreadyShowsNothingUnread() {
        let effects = ChatRealtimeEffects([
            .read(.init(serverID: "s", chatID: "chat_1", sequence: 4)),
        ], serverID: "s")

        XCTAssertFalse(effects.needsChatListRead { _ in 0 })
        XCTAssertTrue(effects.needsChatListRead { _ in 2 })
        XCTAssertTrue(effects.needsChatListRead { _ in nil })
    }

    func testAThreadReadRefreshesTheAnchorWithoutAnyThreadContext() {
        let effects = ChatRealtimeEffects([
            .read(.init(
                serverID: "s", chatID: "thread_1", parentChatID: "chat_1",
                sequence: 4, threadAnchorMessageID: "anchor_1"
            )),
        ], serverID: "s")

        XCTAssertEqual(effects.readChatIDs, ["chat_1"])
        XCTAssertEqual(effects.entityRefreshes, [EntityRefresh(chatID: "chat_1", messageID: "anchor_1")])
    }

    func testDeletionPurgesAndLabelsCarryNoMessageIDs() {
        let effects = ChatRealtimeEffects([
            .lifecycle(.init(serverID: "s", chatID: "chat_1", action: .deleted)),
            .lifecycle(.init(serverID: "s", chatID: "chat_2", action: .updated)),
            .taskLabelUpdated(.init(serverID: "s", labelID: "label_1")),
        ], serverID: "s")

        XCTAssertEqual(effects.deletedChatIDs, ["chat_1"])
        XCTAssertEqual(effects.changedLabelIDs, ["label_1"])
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
