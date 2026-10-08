import Foundation
import XCTest
@testable import HausModels

/// `description` is optional on the wire: present, explicitly null, or absent
/// on a Server older than the field.
final class ChatDescriptionTests: XCTestCase {
    func testDecodesAPresentDescription() throws {
        let chat = try decode(descriptionField: #""description": "General channel for all members.","#)
        XCTAssertEqual(chat.description, "General channel for all members.")
    }

    func testDecodesANullDescription() throws {
        XCTAssertNil(try decode(descriptionField: #""description": null,"#).description)
    }

    func testDecodesAMissingDescription() throws {
        XCTAssertNil(try decode(descriptionField: "").description)
    }

    private func decode(descriptionField: String) throws -> ChatSummary {
        let json = """
        {
          "archivedAt": null,
          "archivedByUserId": null,
          "color": null,
          "createdAt": "2026-01-01T00:00:00Z",
          \(descriptionField)
          "icon": null,
          "id": "chat_all",
          "isAll": true,
          "kind": "channel",
          "lastActivityAt": null,
          "lastMessageSequence": 0,
          "name": "all",
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
        return try HausJSON.decoder().decode(ChatSummary.self, from: Data(json.utf8))
    }
}
