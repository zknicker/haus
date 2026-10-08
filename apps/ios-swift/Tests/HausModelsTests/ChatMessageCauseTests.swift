import Foundation
import XCTest
@testable import HausModels

/// The phone decodes the Server's current `messageCauseSchema`. The previous
/// model expected fields the Server stopped sending, so every cause decoded
/// away to nil and the cause line could never show.
final class ChatMessageCauseTests: XCTestCase {
    func testDecodesALiveTriggerCause() throws {
        let message = try decodeMessage(cause: """
        {
          "attribution": "explicit",
          "automationId": "automation_1",
          "description": null,
          "firedAt": "2026-08-15T14:00:00.500Z",
          "fireId": "fire_1",
          "kind": "trigger",
          "live": {
            "fireCount": 3,
            "instruction": "Summarize the release.",
            "lastFiredAt": "2026-08-15T14:00:00.500Z",
            "status": "armed"
          },
          "ownerAgentId": "agent_1",
          "summary": "Webhook",
          "title": "Deploy finished",
          "unknownFutureKey": {"nested": true}
        }
        """)

        let cause = try XCTUnwrap(message.cause)
        XCTAssertEqual(cause.kind, .trigger)
        XCTAssertEqual(cause.attribution, "explicit")
        XCTAssertEqual(cause.automationID, "automation_1")
        XCTAssertEqual(cause.fireID, "fire_1")
        XCTAssertEqual(cause.ownerAgentID, "agent_1")
        XCTAssertEqual(cause.title, "Deploy finished")
        XCTAssertEqual(cause.summary, "Webhook")
        XCTAssertEqual(cause.firedAt, HausISO8601.date(from: "2026-08-15T14:00:00.500Z"))
        XCTAssertEqual(cause.live?.fireCount, 3)
        XCTAssertEqual(cause.live?.status, "armed")
        XCTAssertEqual(cause.live?.instruction, "Summarize the release.")
    }

    /// An archived automation has no live record; the snapshot still decodes.
    func testDecodesAnArchivedReminderCause() throws {
        let message = try decodeMessage(cause: """
        {
          "attribution": "inferred",
          "automationId": "automation_3",
          "description": "Check the overnight build and post what broke.",
          "firedAt": "2026-08-15T09:00:00Z",
          "fireId": "fire_3",
          "kind": "reminder",
          "live": null,
          "ownerAgentId": "agent_2",
          "summary": "Every weekday at 09:00",
          "title": "Morning build check"
        }
        """)

        let cause = try XCTUnwrap(message.cause)
        XCTAssertEqual(cause.kind, .reminder)
        XCTAssertNil(cause.live)
        XCTAssertEqual(cause.description, "Check the overnight build and post what broke.")
        XCTAssertEqual(message.content, "Please review this.")
    }

    /// A kind this build does not know keeps its wire string rather than
    /// costing the reader the message.
    func testDecodesAnUnknownCauseKind() throws {
        let message = try decodeMessage(cause: """
        {
          "attribution": "explicit",
          "automationId": "automation_2",
          "description": null,
          "firedAt": "2026-08-15T09:00:00Z",
          "fireId": "fire_2",
          "kind": "webhook",
          "live": null,
          "ownerAgentId": "agent_1",
          "summary": "Inbound",
          "title": "Weekly self-review"
        }
        """)

        XCTAssertEqual(try XCTUnwrap(message.cause).kind, .unknown("webhook"))
    }

    func testAMalformedCauseLeavesTheMessageDecodable() throws {
        let missingFields = try decodeMessage(cause: #"{"kind":"trigger"}"#)
        XCTAssertNil(missingFields.cause)
        XCTAssertEqual(missingFields.content, "Please review this.")

        let wrongTypes = try decodeMessage(cause: #"{"kind":7,"automationId":[],"fireId":null}"#)
        XCTAssertNil(wrongTypes.cause)

        let notAnObject = try decodeMessage(cause: #""trigger""#)
        XCTAssertNil(notAnObject.cause)
    }

    func testAMessageWithoutACauseDecodesAsBefore() throws {
        let message = try decodeMessage(cause: nil)

        XCTAssertNil(message.cause)
        XCTAssertEqual(message.id, "message_1")
        XCTAssertEqual(message.sequence, 1)
        XCTAssertEqual(message.attachments.count, 1)
        if case let .human(_, userID) = message.author {
            XCTAssertEqual(userID, "user_1")
        } else {
            XCTFail("Expected a human author")
        }
    }

    private func decodeMessage(cause: String?) throws -> ChatMessage {
        let causeEntry = cause.map { "\"cause\": \($0)," } ?? ""
        let json = """
        {
          \(causeEntry)
          "attachments": [{"filename":"brief.pdf","id":"attachment_1","mediaType":"application/pdf","sizeBytes":42}],
          "author": {"kind":"human","userId":"user_1"},
          "chatId": "chat_1",
          "content": "Please review this.",
          "createdAt": "2026-08-15T14:00:00Z",
          "id": "message_1",
          "nonce": "nonce_1",
          "runId": null,
          "sequence": 1,
          "serverId": "server_1"
        }
        """
        return try HausJSON.decoder().decode(ChatMessage.self, from: Data(json.utf8))
    }
}
