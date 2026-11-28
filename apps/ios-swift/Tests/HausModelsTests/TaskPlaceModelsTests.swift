import Foundation
import XCTest
@testable import HausModels

final class TaskPlaceModelsTests: XCTestCase {
    // MARK: - Chat kind

    func testAChatOfEveryKindDecodesAndAnUnknownKindIsNotFatal() throws {
        XCTAssertEqual(try chat(kind: "channel").kind, .channel)
        XCTAssertEqual(try chat(kind: "dm").kind, .dm)
        XCTAssertEqual(try chat(kind: "captain").kind, .captain)
        XCTAssertEqual(try chat(kind: "forum").kind, .unknown)
    }

    func testChannelsDMsAndCaptainChatsAreListedConversations() {
        XCTAssertTrue(ChatKind.channel.isListedConversation)
        XCTAssertTrue(ChatKind.dm.isListedConversation)
        XCTAssertTrue(ChatKind.captain.isListedConversation)
        XCTAssertFalse(ChatKind.unknown.isListedConversation)
    }

    func testACaptainChatNamesItsCaptainAndTheReadersFlags() throws {
        let captain = try decode(ChatSummary.self, chatJSON(
            kind: "captain",
            peerAgentID: "agent_forge",
            extra: #","captainChat":{"member":true,"subscribed":false}"#
        ))
        XCTAssertEqual(captain.captainID, "agent_forge")
        XCTAssertEqual(captain.captainChat, CaptainChatMembership(member: true, subscribed: false))
        XCTAssertNil(try chat(kind: "channel").captainChat)
        XCTAssertNil(try chat(kind: "dm").captainID)
    }

    func testARetiredCaptainsChatIsReadOnly() throws {
        let retired = try decode(ChatSummary.self, chatJSON(kind: "captain", peerAgentID: "agent_old", retired: true))
        XCTAssertTrue(retired.isReadOnly)
        XCTAssertFalse(try chat(kind: "captain").isReadOnly)
    }

    // MARK: - Task preview on a page

    func testAPageCarriesItsTaskPreviewsAndDropsOneItCannotRead() throws {
        let page = try decode(ChatMessagePage.self, """
        {"messages":[],"nextBeforeSequence":null,"nextAfterSequence":null,"scannedThroughSequence":4,
         "futureField":true,
         "tasks":[\(Self.previewJSON),{"taskId":"broken"}]}
        """)
        XCTAssertEqual(page.tasks.count, 1)
        let preview = try XCTUnwrap(page.tasks.first)
        XCTAssertEqual(preview.taskID, "task_12")
        XCTAssertEqual(preview.chatID, "chat_task_12")
        XCTAssertEqual(preview.shortID, "k3mq7xta")
        XCTAssertFalse(preview.isArchived)
        XCTAssertEqual(preview.originMessageID, "msg_origin")
        XCTAssertEqual(preview.recentMessages.map(\.id), ["m1", "m2"])
        XCTAssertEqual(preview.messageCount, 5)
        XCTAssertEqual(preview.unreadCount, 2)
        XCTAssertTrue(preview.followed)
    }

    func testPreviewsGroupUnderTheirOriginMessage() throws {
        let preview = try decode(TaskPreview.self, Self.previewJSON)
        let second = TaskPreview(
            taskID: "task_13", chatID: "chat_task_13", shortID: "p8vd2nrw", title: "Second",
            originMessageID: "msg_origin", messageCount: 0
        )
        let other = TaskPreview(
            taskID: "task_14", chatID: "chat_task_14", shortID: "q9we3psx", title: "Other",
            archivedAt: Date(timeIntervalSince1970: 0), originMessageID: "msg_other", messageCount: 1
        )
        let grouped = TaskPreview.byOriginMessageID([preview, second, other])
        XCTAssertEqual(grouped["msg_origin"]?.map(\.taskID), ["task_12", "task_13"])
        XCTAssertEqual(grouped["msg_other"]?.map(\.taskID), ["task_14"])
    }

    // MARK: - Task detail

    func testATaskDetailDecodesItsPlaceAndPullRequests() throws {
        let detail = try decode(TaskDetail.self, Self.detailJSON)
        XCTAssertEqual(detail.task.chatID, "chat_task_12")
        XCTAssertEqual(detail.task.status, .working)
        XCTAssertEqual(detail.task.origin, TaskOrigin(chatID: "chat_security", messageID: "msg_origin"))
        XCTAssertTrue(detail.followed)
        XCTAssertEqual(detail.unreadCount, 3)
        let pullRequest = try XCTUnwrap(detail.pullRequests.first)
        XCTAssertEqual(pullRequest.number, 42)
        XCTAssertEqual(pullRequest.checks, "passing")
        XCTAssertEqual(pullRequest.review, "changes-requested")
        XCTAssertEqual(pullRequest.title, "Rate-limit webhooks")
        XCTAssertEqual(detail.reminders.first?.setBy, TaskReminderSetter(agentID: "agent_forge", displayName: "Forge"))
    }

    func testAChatlessHistoryTaskDetailDecodes() throws {
        let detail = try decode(TaskDetail.self, """
        {"activity":"idle","agentId":null,"archivedAt":"2026-10-31T16:00:00Z","captainId":null,"chatId":null,
         "computerId":null,"createdAt":"2026-10-30T16:00:00Z","createdBy":{"agentId":"agent_zero","kind":"agent"},
         "description":"","descriptionContent":"","descriptionTaskLinks":[],"followed":false,"id":"task_1",
         "mentions":[],"model":null,"needsYou":false,"origin":null,"projectId":"chat_security","pullRequests":[],
         "reminders":[],"serverId":"server_1","shortId":"a1b2c3d4","title":"Old","titleCustom":false,
         "unreadCount":0,"updatedAt":"2026-10-30T16:00:00Z","version":1}
        """)
        XCTAssertNil(detail.task.chatID)
        XCTAssertTrue(detail.task.isArchived)
        XCTAssertNil(detail.task.origin)
        XCTAssertEqual(detail.pullRequests, [])
        XCTAssertFalse(detail.followed)
    }

    // MARK: - Unread previews

    func testUnreadPreviewsKeepTheTaskRowsAndDropWhatTheyCannotRead() throws {
        let list = try decode(ChatUnreadPreviewList.self, """
        {"previews":[
          {"chatId":"chat_task_12","earlierUnreadCount":2,"messages":[\(Self.messageJSON("m1", chatID: "chat_task_12"))],
           "task":{"archivedAt":null,"projectId":"chat_security","shortId":"k3mq7xta","taskId":"task_12","title":"Rate-limit"}},
          {"chatId":"chat_product","earlierUnreadCount":0,"messages":[\(Self.messageJSON("m2", chatID: "chat_product"))],"task":null},
          {"chatId":42}
        ]}
        """)
        XCTAssertEqual(list.previews.map(\.chatID), ["chat_task_12", "chat_product"])
        let task = try XCTUnwrap(list.taskPreviews.first)
        XCTAssertEqual(list.taskPreviews.count, 1)
        XCTAssertEqual(task.task, ChatUnreadPreviewTask(
            projectID: "chat_security", shortID: "k3mq7xta", taskID: "task_12", title: "Rate-limit"
        ))
        XCTAssertEqual(task.unreadCount, 3)
    }

    // MARK: - Events

    func testMessageAndReadEventsCarryTheirTask() throws {
        let created = try decode(MessageCreatedEvent.self, """
        {"authorUserId":null,"chatId":"chat_task_12","conversationKind":"channel","mentionedUserIds":[],
         "messageId":"m9","parentChatId":null,"replyToAuthorUserId":null,"sequence":9,"serverId":"server_1",
         "taskId":"task_12","future":1}
        """)
        XCTAssertEqual(created.taskID, "task_12")
        let read = try decode(ChatReadEvent.self, """
        {"chatId":"chat_task_12","parentChatId":null,"sequence":4,"serverId":"server_1","taskId":"task_12"}
        """)
        XCTAssertEqual(read.taskID, "task_12")
        let plain = try decode(ChatReadEvent.self, #"{"chatId":"chat_1","sequence":4,"serverId":"server_1"}"#)
        XCTAssertNil(plain.taskID)
    }

    func testTaskEventsDecodeWithAndWithoutAChat() throws {
        let updated = try decode(TaskChangedEvent.self, #"{"chatId":"chat_task_12","serverId":"s","taskId":"t","version":4}"#)
        XCTAssertEqual(updated, TaskChangedEvent(serverID: "s", taskID: "t", chatID: "chat_task_12", version: 4))
        let chatless = try decode(TaskChangedEvent.self, #"{"chatId":null,"serverId":"s","taskId":"t","version":5}"#)
        XCTAssertNil(chatless.chatID)
        let follow = try decode(TaskFollowUpdatedEvent.self, #"{"chatId":"chat_task_12","followed":true,"serverId":"s","taskId":"t"}"#)
        XCTAssertEqual(follow, TaskFollowUpdatedEvent(serverID: "s", taskID: "t", chatID: "chat_task_12", followed: true))
    }

    func testTaskEventsAskForFocusedReads() {
        let effects = ChatRealtimeEffects([
            .messageCreated(.init(serverID: "s", chatID: "chat_task_1", messageID: "m1", sequence: 1, taskID: "task_1")),
            .read(.init(serverID: "s", chatID: "chat_task_2", sequence: 3, taskID: "task_2")),
            .taskChanged(.init(serverID: "s", taskID: "task_3", chatID: "chat_task_3", version: 2)),
            .taskFollowUpdated(.init(serverID: "s", taskID: "task_4", chatID: "chat_task_4", followed: false)),
        ], serverID: "s")

        XCTAssertEqual(effects.tailSequenceByChatID, ["chat_task_1": 1])
        XCTAssertEqual(effects.taskIDsToRefreshPreview, ["task_1", "task_2", "task_3", "task_4"])
        XCTAssertEqual(effects.changedTaskIDs, ["task_3", "task_4"])
        XCTAssertTrue(effects.reloadsUnreadTasks)
        XCTAssertTrue(effects.readChatIDs.isEmpty)
    }

    func testTheFollowStreamReconcilesTheUnreadTasks() {
        XCTAssertEqual(RealtimeStream.taskFollowUpdated.path, "task.onFollowUpdated")
        XCTAssertEqual(RealtimeStream.taskFollowUpdated.ownedProjections, [.unreadTasks])
        XCTAssertTrue(RealtimeStream.messageCreated.ownedProjections.contains(.unreadTasks))
    }

    // MARK: - Transcript cache

    func testAMessageEntityReadKeepsThePageTasks() throws {
        var store = TranscriptStore()
        let origin = TranscriptFixture.message("msg_origin", sequence: 1)
        let preview = try decode(TaskPreview.self, Self.previewJSON)
        store.write(
            ChatMessagePage(messages: [origin], nextBeforeSequence: nil, tasks: [preview]),
            to: .chat("chat_1"),
            as: .replace
        )
        XCTAssertEqual(store.page(.chat("chat_1"))?.tasks.map(\.taskID), ["task_12"])
        XCTAssertEqual(store.refreshes(previewingTasks: ["task_12"]), [EntityRefresh(chatID: "chat_1", messageID: "msg_origin")])
        XCTAssertEqual(store.taskPreview(chatID: "chat_task_12")?.taskID, "task_12")

        store.setEntity(ChatMessageEntity(message: origin))
        XCTAssertEqual(store.page(.chat("chat_1"))?.tasks.map(\.taskID), ["task_12"])

        let archived = TaskPreview(
            taskID: "task_12", chatID: "chat_task_12", shortID: "k3mq7xta", title: "Rate-limit",
            archivedAt: Date(timeIntervalSince1970: 0), originMessageID: "msg_origin", messageCount: 6
        )
        store.setEntity(ChatMessageEntity(message: origin, tasks: [archived]))
        XCTAssertEqual(store.page(.chat("chat_1"))?.tasks.map(\.isArchived), [true])

        store.write(
            ChatMessagePage(messages: [origin], nextBeforeSequence: nil),
            to: .chat("chat_1"),
            as: .reseed
        )
        XCTAssertEqual(store.page(.chat("chat_1"))?.tasks, [])
    }

    func testASingleMessageReadCarriesItsTaskPreviews() throws {
        let message = Self.messageJSON("msg_origin", chatID: "chat_security")
        let entity = try decode(ChatMessageEntity.self, """
        {"message":\(message),"tasks":[\(Self.previewJSON),{"taskId":"broken"}],"futureField":1}
        """)
        XCTAssertEqual(entity.tasks?.map(\.taskID), ["task_12"])
        let older = try decode(ChatMessageEntity.self, #"{"message":\#(message)}"#)
        XCTAssertNil(older.tasks)
    }

    // MARK: - Fixtures

    static let previewJSON = """
    {"archivedAt":null,"chatId":"chat_task_12","followed":true,"messageCount":5,"originMessageId":"msg_origin",
     "recentMessages":[
       {"authorAgentId":"agent_forge","authorUserId":null,"content":"On it","createdAt":"2026-11-17T10:00:00Z","id":"m1"},
       {"authorAgentId":null,"authorUserId":"user_1","content":"Thanks","createdAt":"2026-11-17T10:05:00Z","id":"m2"}],
     "shortId":"k3mq7xta","taskId":"task_12","title":"Rate-limit Trigger webhooks","unreadCount":2}
    """

    static let detailJSON = """
    {"activity":"working","agentId":"agt_task_12","archivedAt":null,"captainId":"agent_forge",
     "chatId":"chat_task_12","computerId":"cmp_1","createdAt":"2026-10-30T16:00:00Z",
     "createdBy":{"agentId":"agent_forge","kind":"agent"},"description":"","descriptionContent":"",
     "descriptionTaskLinks":[],"followed":true,"id":"task_12","mentions":[],"model":"gpt-5.5","needsYou":false,
     "origin":{"chatId":"chat_security","messageId":"msg_origin"},"projectId":"chat_security",
     "serverId":"server_1","shortId":"k3mq7xta","title":"Rate-limit","titleCustom":false,"unreadCount":3,
     "updatedAt":"2026-11-03T16:00:00Z","version":3,
     "pullRequests":[{"additions":10,"changedFiles":2,"checks":"passing","deletions":1,"headSha":"abc",
       "number":42,"observedAt":"2026-11-17T10:00:00Z","repository":"haus/haus","review":"changes-requested",
       "settledAt":null,"source":"github","state":"open","title":"Rate-limit webhooks",
       "url":"https://github.com/haus/haus/pull/42"}],
     "reminders":[{"anchorChatId":"chat_task_12","kind":"once","nextFireAt":"2026-11-17T19:35:00Z",
       "reminderId":"rem_1","setBy":{"agentId":"agent_forge","displayName":"Forge"},"title":"Check back"}]}
    """

    static func messageJSON(_ id: String, chatID: String) -> String {
        """
        {"attachments":[],"author":{"agentId":"agent_1","kind":"agent"},"chatId":"\(chatID)",
         "content":"hi","createdAt":"2026-11-17T10:00:00Z","id":"\(id)","nonce":"n_\(id)",
         "runId":null,"sequence":7,"serverId":"server_1"}
        """
    }

    private func chat(kind: String) throws -> ChatSummary {
        try decode(ChatSummary.self, chatJSON(kind: kind))
    }

    private func chatJSON(kind: String, peerAgentID: String? = nil, retired: Bool = false, extra: String = "") -> String {
        let peer = peerAgentID.map { #""\#($0)""# } ?? "null"
        return """
        {"archivedAt":null,"archivedByUserId":null,"color":null,"createdAt":"2026-01-01T00:00:00Z","icon":null,
         "id":"chat_\(kind)","isAll":false,"kind":"\(kind)","lastActivityAt":null,"lastMessage":null,
         "lastMessageSequence":0,"name":"launches","participantAgentIds":[],"participantUserIds":[],
         "peerAgentDisplayName":null,"peerAgentId":\(peer),"peerAgentRetired":\(retired),"peerUserId":null,
         "serverId":"server_1","unreadCount":0\(extra)}
        """
    }

    private func decode<Value: Decodable>(_ type: Value.Type, _ json: String) throws -> Value {
        try HausJSON.decoder().decode(type, from: Data(json.utf8))
    }
}
