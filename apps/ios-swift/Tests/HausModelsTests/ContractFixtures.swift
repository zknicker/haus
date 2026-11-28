import Foundation
import XCTest
@testable import HausModels

enum ContractFixtures {
    static func decode<Value: Decodable>(_ type: Value.Type, _ json: String) throws -> Value {
        try HausJSON.decoder().decode(type, from: Data(json.utf8))
    }

    static func encoded<Value: Encodable>(_ value: Value) throws -> NSDictionary {
        let data = try HausJSON.encoder().encode(value)
        return try XCTUnwrap(try JSONSerialization.jsonObject(with: data, options: [.fragmentsAllowed]) as? NSDictionary)
    }

    static func object(_ json: String) throws -> NSDictionary {
        try XCTUnwrap(try JSONSerialization.jsonObject(with: Data(json.utf8)) as? NSDictionary)
    }

    /// A Task as `taskSchema` writes it (ADR 0062).
    static let task = """
    {"activity":"working","agentId":"agt_task_12","archivedAt":null,"captainId":"agent_1",
     "chatId":"chat_task_12","computerId":"cmp_1","createdAt":"2026-11-20T10:00:00.000Z",
     "createdBy":{"kind":"agent","agentId":"agent_1"},"description":"","id":"task_12","model":"gpt-5.5",
     "needsYou":false,"origin":{"chatId":"chat_sec","messageId":"msg_1"},"projectId":"project_sec",
     "serverId":"server_1","shortId":"k3mq7xta","title":"Rate-limit webhooks","titleCustom":false,
     "updatedAt":"2026-11-20T11:00:00.000Z","version":3}
    """

    static let pullRequestReading = """
    {"additions":10,"changedFiles":2,"checks":"passing","deletions":1,"headSha":"abc123","number":42,
     "observedAt":"2026-11-20T10:30:00.000Z","repository":"haus/haus","review":"approved",
     "settledAt":null,"source":"github","state":"open","title":"Rate-limit webhooks",
     "url":"https://github.com/haus/haus/pull/42"}
    """

    static let chat = """
    {"archivedAt":null,"archivedByUserId":null,"color":"violet","createdAt":"2026-11-20T10:00:00.000Z",
     "description":null,"icon":null,"id":"chat_sec","isAll":false,"kind":"channel","lastActivityAt":null,
     "lastMessageSequence":0,"name":"sec","participantAgentIds":[],"participantUserIds":["user_1"],
     "peerAgentDisplayName":null,"peerAgentId":null,"peerAgentRetired":false,"peerUserId":null,
     "serverId":"server_1","unreadCount":0}
    """
}
