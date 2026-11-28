import Foundation
import HausModels

enum TaskPreviewFixtures {
    static let detail: TaskDetail = decode(
        """
        {"activity":"idle","agentId":null,"archivedAt":null,"captainId":null,"chatId":null,"computerId":null,
         "createdAt":"2026-10-30T16:00:00Z","createdBy":{"agentId":"agent_zero","kind":"agent"},
         "description":"A leaked Trigger URL can be hammered with valid-looking deliveries.\\n\\n- Limit deliveries per Trigger secret, not per IP.\\n- Return `429` with `Retry-After`.",
         "descriptionContent":"A leaked Trigger URL can be hammered with valid-looking deliveries.\\n\\n- Limit deliveries per Trigger secret, not per IP.\\n- Return `429` with `Retry-After`.",
         "descriptionTaskLinks":[],"followed":false,"id":"task_12","model":null,"needsYou":false,
         "origin":null,"projectId":"chat_security","pullRequests":[],"serverId":"server_preview",
         "shortId":"k3mq7xta","title":"Rate-limit Trigger webhook endpoints per secret","titleCustom":false,
         "unreadCount":0,"updatedAt":"2026-11-03T16:00:00Z","version":3,
         "mentions":[
           {"authorLabel":"Forge","chatId":"chat_security","createdAt":"2026-11-03T14:00:00Z",
            "excerpt":"Should the limit apply to GitHub Triggers too?","messageId":"message_1",
            "place":{"chatId":"chat_security","chatKind":"channel","chatName":"security"}},
           {"authorLabel":"Zero","chatId":"chat_security","createdAt":"2026-10-30T16:12:00Z",
            "excerpt":"Security sweep is done.","messageId":"message_2",
            "place":{"chatId":"chat_security","chatKind":"channel","chatName":"security"}}],
         "reminders":[
           {"anchorChatId":"chat_security","kind":"once","nextFireAt":"2026-11-07T14:00:00Z",
            "reminderId":"reminder_1","title":"Re-check the limit after the Server deploy"}]}
        """
    )

    private static func decode<Value: Decodable>(_ json: String) -> Value {
        do {
            return try HausJSON.decoder().decode(Value.self, from: Data(json.utf8))
        } catch {
            preconditionFailure("Invalid task preview fixture: \(error)")
        }
    }
}
