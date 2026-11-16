import Foundation

/// Stable, network-free values for SwiftUI previews and transport smoke tests.
/// These deliberately use the same JSON decoding path as production responses.
public enum HausPreviewFixtures {
    public static let server: ServerSummary = decode(
        """
        {"displayName":"Haus","id":"srv_preview","role":"owner","slug":"haus"}
        """
    )

    public static let agents: [AgentSummary] = decode(
        """
        [{"availability":"idle","avatarUrl":null,"computerId":"computer_preview","createdAt":"2026-01-01T00:00:00Z","createdByUserId":"user_preview","description":"Onboarding Assistant","desiredModelId":"model_preview","desiredRuntimeId":"runtime_preview","displayName":"Cove","dmChatId":"chat_cove","effectiveModelId":"model_preview","effectiveReportedAt":"2026-01-01T00:00:00.000Z","effectiveRuntimeId":"runtime_preview","factoryKind":"cove","handle":"cove-agent","id":"agent_cove","missingResources":[],"serverId":"srv_preview","status":"applied"}]
        """
    )

    public static let memberDirectory: MemberList = decode(
        """
        {"members":[{"avatarUrl":null,"description":null,"displayName":"Zach","email":"zach@example.com","handle":"zach","joinedAt":"2026-01-01T00:00:00Z","role":"owner","userId":"user_preview"}],"viewerRole":"owner","viewerUserId":"user_preview"}
        """
    )

    public static let chats: [ChatSummary] = decode(
        """
        [{"archivedAt":null,"archivedByUserId":null,"color":null,"createdAt":"2026-01-01T00:00:00Z","icon":null,"id":"chat_all","isAll":true,"kind":"channel","lastActivityAt":"2026-01-01T00:01:00Z","lastMessageSequence":1,"name":"all","participantAgentIds":["agent_cove"],"participantUserIds":["user_preview"],"peerAgentDisplayName":null,"peerAgentId":null,"peerAgentRetired":false,"peerUserId":null,"serverId":"srv_preview","unreadCount":0},
         {"archivedAt":null,"archivedByUserId":null,"color":"amber","createdAt":"2026-01-01T00:00:00Z","icon":"RocketIcon","id":"chat_launches","isAll":false,"kind":"channel","lastActivityAt":"2026-01-01T00:01:00Z","lastMessageSequence":1,"name":"launches","participantAgentIds":["agent_cove"],"participantUserIds":["user_preview"],"peerAgentDisplayName":null,"peerAgentId":null,"peerAgentRetired":false,"peerUserId":null,"serverId":"srv_preview","unreadCount":0},
         {"archivedAt":null,"archivedByUserId":null,"color":null,"createdAt":"2026-01-01T00:00:00Z","icon":null,"id":"chat_cove","isAll":false,"kind":"dm","lastActivityAt":"2026-01-01T00:01:00Z","lastMessageSequence":1,"name":null,"participantAgentIds":["agent_cove"],"participantUserIds":["user_preview"],"peerAgentDisplayName":"Cove","peerAgentId":"agent_cove","peerAgentRetired":false,"peerUserId":null,"serverId":"srv_preview","unreadCount":0}]
        """
    )

    public static let messages: [ChatMessage] = decode(
        """
        [{"attachments":[],"author":{"agentId":"agent_cove","kind":"agent","profile":{"avatarUrl":null,"deleted":false,"description":"Onboarding Assistant","displayName":"Cove"}},"chatId":"chat_cove","content":"Welcome to Haus.","createdAt":"2026-01-01T00:01:00Z","id":"message_preview","nonce":"nonce_preview","runId":null,"sequence":1,"serverId":"srv_preview","claim":null}]
        """
    )

    private static func decode<Value: Decodable>(_ json: String) -> Value {
        do {
            return try HausJSON.decoder().decode(Value.self, from: Data(json.utf8))
        } catch {
            preconditionFailure("Invalid Haus preview fixture: \(error)")
        }
    }
}
