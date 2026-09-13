import Foundation
import XCTest
@testable import HausModels

/// Which conversations refuse a new Message. Haus App reads the same predicate
/// as `readOnly`, and the phone gates its Ask answer controls on it.
final class ChatReadOnlyTests: XCTestCase {
    func testAnOpenChannelTakesMessages() throws {
        XCTAssertFalse(try chat().isReadOnly)
    }

    func testAnArchivedChannelIsReadOnly() throws {
        XCTAssertTrue(try chat(archivedAt: "\"2026-09-01T00:00:00Z\"").isReadOnly)
    }

    func testADmWithARetiredPeerAgentIsReadOnly() throws {
        XCTAssertTrue(try chat(kind: "dm", peerAgentRetired: true).isReadOnly)
    }

    /// Retirement is the peer Agent's, so it only ends a DM. A channel keeps
    /// every other participant and stays writable.
    func testAChannelIgnoresTheRetiredPeerFlag() throws {
        XCTAssertFalse(try chat(peerAgentRetired: true).isReadOnly)
    }

    private func chat(
        archivedAt: String = "null",
        kind: String = "channel",
        peerAgentRetired: Bool = false
    ) throws -> ChatSummary {
        let json = """
        {
          "archivedAt": \(archivedAt),
          "archivedByUserId": null,
          "color": null,
          "createdAt": "2026-01-01T00:00:00Z",
          "icon": null,
          "id": "chat_1",
          "isAll": false,
          "kind": "\(kind)",
          "lastActivityAt": null,
          "lastMessageSequence": 0,
          "name": "launches",
          "participantAgentIds": [],
          "participantUserIds": ["user_1"],
          "peerAgentDisplayName": null,
          "peerAgentId": null,
          "peerAgentRetired": \(peerAgentRetired),
          "peerUserId": null,
          "serverId": "server_1",
          "unreadCount": 0
        }
        """
        return try HausJSON.decoder().decode(ChatSummary.self, from: Data(json.utf8))
    }
}
