import Foundation
import XCTest
@testable import HausModels

final class HausModelsTests: XCTestCase {
    func testDecodesAgentAndMemberContracts() throws {
        let json = """
        {
          "availability": "working",
          "avatarUrl": "https://example.com/cove.png",
          "computerId": "computer_1",
          "createdAt": "2026-08-15T14:00:00.123Z",
          "createdByUserId": "user_1",
          "description": "Onboarding assistant",
          "desiredModelId": "model_1",
          "desiredRuntimeId": "runtime_1",
          "displayName": "Cove",
          "dmChatId": "chat_1",
          "effectiveModelId": "model_1",
          "effectiveReportedAt": "2026-08-15T14:00:01+00:00",
          "effectiveRuntimeId": "runtime_1",
          "factoryKind": "cove",
          "handle": "cove-agent",
          "id": "agent_1",
          "missingResources": [],
          "role": "admin",
          "serverId": "server_1",
          "status": "applied"
        }
        """

        let agent = try HausJSON.decoder().decode(AgentSummary.self, from: Data(json.utf8))

        XCTAssertEqual(agent.displayName, "Cove")
        XCTAssertEqual(agent.availability, .working)
        XCTAssertEqual(agent.serverID, "server_1")
        XCTAssertEqual(agent.effectiveReportedAt, HausISO8601.date(from: "2026-08-15T14:00:01+00:00"))

        let directory = try HausJSON.decoder().decode(
            MemberList.self,
            from: Data(
                """
                {"members":[{"avatarUrl":null,"description":null,"displayName":"Zach","email":"zach@example.com","handle":"zach","joinedAt":"2026-08-15T14:00:00Z","role":"owner","userId":"user_1"}],"viewerRole":"owner","viewerUserId":"user_1"}
                """.utf8
            )
        )

        XCTAssertEqual(directory.members.first?.id, "user_1")
        XCTAssertEqual(directory.viewerRole, .owner)
    }

    func testDecodesMessagePageAuthorsThreadsAndTasks() throws {
        let json = """
        {
          "messages": [
            {
              "attachments": [{"filename":"brief.pdf","id":"attachment_1","mediaType":"application/pdf","sizeBytes":42}],
              "author": {"kind":"human","userId":"user_1","profile":{"avatarUrl":null,"deleted":false,"description":null,"displayName":"Zach"}},
              "chatId":"chat_1","content":"Please review this.","createdAt":"2026-08-15T14:00:00Z","id":"message_1","nonce":"nonce_1","runId":null,"sequence":1,"serverId":"server_1",
              "task": {"assigneeAgentId":"agent_1","assigneeUserId":null,"chatId":"chat_1","claimedAt":null,"createdAt":"2026-08-15T14:00:00Z","createdByAgentId":null,"createdByUserId":"user_1","labels":[],"live":false,"messageId":"message_1","number":1,"origin":"converted","priority":"high","status":"todo","threadChatId":"thread_1","tier":"tracked","updatedAt":"2026-08-15T14:00:00Z","version":1}
            }
          ],
          "nextBeforeSequence": null,
          "threads": [{"anchorMessageId":"message_1","followed":true,"latestReplyAt":"2026-08-15T14:01:00Z","recentReplies":[],"replyCount":1,"threadChatId":"thread_1","unreadCount":1}]
        }
        """

        let page = try HausJSON.decoder().decode(ChatMessagePage.self, from: Data(json.utf8))

        XCTAssertEqual(page.messages.count, 1)
        XCTAssertEqual(page.messages[0].attachments[0].mediaType, "application/pdf")
        XCTAssertEqual(page.messages[0].task?.status, .todo)
        XCTAssertEqual(page.threads[0].replyCount, 1)

        if case let .human(_, userID) = page.messages[0].author {
            XCTAssertEqual(userID, "user_1")
        } else {
            XCTFail("Expected a human author")
        }
    }

    func testDecodesLifecycleAndDurableChatEvents() throws {
        let lifecycleJSON = """
        {"agentId":"agent_1","chatId":"chat_1","emittedAt":"2026-08-15T14:00:00.000Z","runId":"run_1","serverId":"server_1","phase":"settled","outcome":"completed"}
        """
        let lifecycle = try HausJSON.decoder().decode(
            AgentLifecycleEvent.self,
            from: Data(lifecycleJSON.utf8)
        )
        XCTAssertEqual(lifecycle.phase, .settled)
        XCTAssertEqual(lifecycle.outcome, .completed)
        XCTAssertTrue(lifecycle.id.hasPrefix("run_1:settled:"))

        let eventJSON = """
        {"chatId":"chat_1","createdAt":"2026-08-15T14:00:00Z","cursor":"42","id":"event_1","messageId":"message_1","parentChatId":null,"sequence":2,"serverId":"server_1","type":"message.created"}
        """
        let event = try HausJSON.decoder().decode(ChatEvent.self, from: Data(eventJSON.utf8))
        XCTAssertEqual(event.type, .messageCreated)
        XCTAssertEqual(event.messageID, "message_1")
        XCTAssertEqual(event.cursor, "42")

        let lifecycleEvent = try HausJSON.decoder().decode(
            ChatEvent.self,
            from: Data(
                "{\"action\":\"deleted\",\"chatId\":\"chat_1\",\"createdAt\":\"2026-08-15T14:00:00Z\",\"cursor\":\"43\",\"id\":\"event_2\",\"parentChatId\":null,\"sequence\":0,\"serverId\":\"server_1\",\"type\":\"chat.lifecycle\"}".utf8
            )
        )
        XCTAssertEqual(lifecycleEvent.action, "deleted")
    }

    func testChatEventReplayStateAdvancesNumericallyAndDeduplicatesByID() {
        let date = Date(timeIntervalSince1970: 1)
        let first = ChatEvent(
            chatID: "chat_1",
            createdAt: date,
            cursor: "9",
            id: "event_9",
            parentChatID: nil,
            sequence: 1,
            serverID: "server_1",
            type: .messageCreated
        )
        let later = ChatEvent(
            chatID: "chat_1",
            createdAt: date,
            cursor: "10",
            id: "event_10",
            parentChatID: nil,
            sequence: 2,
            serverID: "server_1",
            type: .messageCreated
        )

        var replay = ChatEventReplayState(cursor: "8")
        XCTAssertTrue(replay.receive(first))
        XCTAssertFalse(replay.receive(first))
        XCTAssertTrue(replay.receive(later))
        XCTAssertEqual(replay.cursor, "10")
        replay.advance(to: "9")
        XCTAssertEqual(replay.cursor, "10")
    }

    func testChatEventReplayStateStillDispatchesAnEarlierGapAfterNewerLiveEvent() {
        let date = Date(timeIntervalSince1970: 1)
        func event(cursor: String) -> ChatEvent {
            ChatEvent(
                chatID: "chat_1",
                createdAt: date,
                cursor: cursor,
                id: "event_\(cursor)",
                parentChatID: nil,
                sequence: Int(cursor) ?? 0,
                serverID: "server_1",
                type: .messageCreated
            )
        }

        var replay = ChatEventReplayState(cursor: "5")
        XCTAssertTrue(replay.receive(event(cursor: "8")))
        XCTAssertTrue(replay.receive(event(cursor: "6")))
        XCTAssertEqual(replay.cursor, "8")
    }

    func testChatEventCursorNormalizesLeadingZeroes() {
        XCTAssertEqual(ChatEventCursor.later("009", "10"), "10")
        XCTAssertEqual(ChatEventCursor.later("0010", "9"), "10")
        XCTAssertEqual(ChatEventCursor.normalized("000"), "0")
    }

    func testDecodesServerComputerSnapshot() throws {
        let json = """
        {
          "architecture":"arm64",
          "createdAt":"2026-08-15T14:00:00Z",
          "health":"healthy",
          "id":"cmp_1234567890abcdef",
          "lastConnectedAt":"2026-08-15T14:01:00.123Z",
          "name":"Zach's MacBook Pro",
          "operatingSystem":"darwin",
          "productVersion":"1.4.0",
          "protocolVersion":2,
          "reportedInventory":{
            "name":"Zach's MacBook Pro",
            "runtimes":[{"id":"codex","label":"Codex","models":[{"id":"k3","label":"K3"}]}]
          },
          "updateDetail":null,
          "updateDownloadedBytes":null,
          "updateFailedPhase":null,
          "updatePhase":"idle",
          "updateActiveAgentCount":1,
          "updateTargetVersion":null,
          "updateTotalBytes":null,
          "updateUpdatedAt":"2026-08-15T14:01:00Z"
        }
        """

        let computer = try HausJSON.decoder().decode(
            ComputerSummary.self,
            from: Data(json.utf8)
        )

        XCTAssertEqual(computer.health, .healthy)
        XCTAssertEqual(computer.name, "Zach's MacBook Pro")
        XCTAssertEqual(computer.operatingSystem, "darwin")
        XCTAssertEqual(computer.reportedInventory?.runtimes.first?.models.first?.id, "k3")
        XCTAssertEqual(computer.updatePhase, .idle)
        XCTAssertEqual(computer.lastConnectedAt, HausISO8601.date(from: "2026-08-15T14:01:00.123Z"))
    }

    func testDecodesRetiredTaskSystemAuthorFromProductionHistory() throws {
        let json = """
        {"kind":"system","system":"task"}
        """

        let author = try HausJSON.decoder().decode(ChatAuthor.self, from: Data(json.utf8))

        XCTAssertEqual(author, .system(.task))
    }

    func testDecodesTriggerSystemAuthor() throws {
        let json = """
        {"kind":"system","system":"trigger"}
        """

        let author = try HausJSON.decoder().decode(ChatAuthor.self, from: Data(json.utf8))

        XCTAssertEqual(author, .system(.trigger))
    }

    func testDecodesUnknownSystemAuthorInsteadOfFailingThePage() throws {
        let json = """
        {"kind":"system","system":"future-system-author"}
        """

        let author = try HausJSON.decoder().decode(ChatAuthor.self, from: Data(json.utf8))

        XCTAssertEqual(author, .system(.unknown("future-system-author")))
        XCTAssertEqual(author.kind, .system)
    }

    func testDecodesAnAgentMessageSessionGeneration() throws {
        let message = try HausJSON.decoder().decode(
            ChatMessage.self,
            from: Data(
                """
                {"attachments":[],"author":{"agentId":"agent_1","kind":"agent"},"chatId":"chat_1","content":"On it.","createdAt":"2026-08-15T14:00:02Z","id":"message_2","nonce":"nonce_2","runId":"run_1","sequence":2,"serverId":"server_1","sessionGeneration":4}
                """.utf8
            )
        )

        XCTAssertEqual(message.sessionGeneration, 4)
    }

    /// A human message carries a null generation, and a Server that predates
    /// the field omits the key. Neither may cost the reader the row.
    func testDecodesAMessageWithoutASessionGeneration() throws {
        let explicitNull = try HausJSON.decoder().decode(
            ChatMessage.self,
            from: Data(
                """
                {"attachments":[],"author":{"kind":"human","userId":"user_1"},"chatId":"chat_1","content":"Please review this.","createdAt":"2026-08-15T14:00:00Z","id":"message_1","nonce":"nonce_1","runId":null,"sequence":1,"serverId":"server_1","sessionGeneration":null}
                """.utf8
            )
        )
        XCTAssertNil(explicitNull.sessionGeneration)

        let absentKey = try HausJSON.decoder().decode(
            ChatMessage.self,
            from: Data(
                """
                {"attachments":[],"author":{"kind":"human","userId":"user_1"},"chatId":"chat_1","content":"Please review this.","createdAt":"2026-08-15T14:00:00Z","id":"message_1","nonce":"nonce_1","runId":null,"sequence":1,"serverId":"server_1"}
                """.utf8
            )
        )
        XCTAssertNil(absentKey.sessionGeneration)
        XCTAssertEqual(absentKey.content, "Please review this.")
    }

    /// The Server no longer writes a system author, so an ordinary page is all
    /// human and Agent rows. Nothing in the transcript may require one.
    func testDecodesAnAgentMessagePageWithNoSystemRows() throws {
        let json = """
        {
          "messages": [
            {"attachments":[],"author":{"kind":"human","userId":"user_1"},"chatId":"chat_1","content":"Please review this.","createdAt":"2026-08-15T14:00:00Z","id":"message_1","nonce":"nonce_1","runId":null,"sequence":1,"serverId":"server_1","sessionGeneration":null},
            {"attachments":[],"author":{"agentId":"agent_1","kind":"agent"},"chatId":"chat_1","content":"Reviewed.","createdAt":"2026-08-15T14:00:02Z","id":"message_2","nonce":"nonce_2","runId":"run_1","sequence":2,"serverId":"server_1","sessionGeneration":7}
          ],
          "nextBeforeSequence": null,
          "threads": []
        }
        """

        let page = try HausJSON.decoder().decode(ChatMessagePage.self, from: Data(json.utf8))

        XCTAssertEqual(page.messages.map(\.author.kind), [.human, .agent])
        XCTAssertFalse(page.messages.contains { $0.author.kind == .system })
        XCTAssertEqual(page.messages.map(\.sessionGeneration), [nil, 7])
    }

    func testFixturesUseTheProductionDecoder() {
        XCTAssertEqual(HausPreviewFixtures.server.slug, "haus")
        XCTAssertEqual(HausPreviewFixtures.agents.first?.displayName, "Cove")
        XCTAssertEqual(HausPreviewFixtures.memberDirectory.viewerUserID, "user_preview")
        XCTAssertEqual(HausPreviewFixtures.chats.last?.kind, .dm)
        XCTAssertEqual(HausPreviewFixtures.chats.first?.name, "all")
        XCTAssertEqual(HausPreviewFixtures.messages.first?.content, "Welcome to Haus.")
    }

    func testDecodesChannelAppearance() throws {
        let json = """
        {
          "archivedAt": null,
          "archivedByUserId": null,
          "color": "amber",
          "createdAt": "2026-01-01T00:00:00Z",
          "icon": "CompassIcon",
          "id": "chat_launches",
          "isAll": false,
          "kind": "channel",
          "lastActivityAt": null,
          "lastMessageSequence": 4,
          "name": "launches",
          "participantAgentIds": [],
          "participantUserIds": ["user_1"],
          "peerAgentDisplayName": null,
          "peerAgentId": null,
          "peerAgentRetired": false,
          "peerUserId": null,
          "serverId": "server_1",
          "unreadCount": 0
        }
        """

        let channel = try HausJSON.decoder().decode(ChatSummary.self, from: Data(json.utf8))

        XCTAssertEqual(channel.color, "amber")
        XCTAssertEqual(channel.icon, "CompassIcon")

        // A DM row, and any Server that predates the appearance columns, sends
        // nulls. Decoding must keep the chat usable rather than fail the page.
        let plain = try HausJSON.decoder().decode(
            ChatSummary.self,
            from: Data(json.replacingOccurrences(of: "\"amber\"", with: "null")
                .replacingOccurrences(of: "\"CompassIcon\"", with: "null").utf8)
        )

        XCTAssertNil(plain.color)
        XCTAssertNil(plain.icon)
    }
}
