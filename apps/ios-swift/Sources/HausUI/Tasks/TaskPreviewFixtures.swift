import Foundation
import HausModels

/// A read-only Task's detail, as the wire returns it: a Task from before Tasks
/// were places, with no Chat. Decoded rather than constructed, so a preview
/// stands on the shape the Server sends.
enum TaskPreviewFixtures {
    static let labels: [TaskLabel] = [
        TaskLabel(color: "blue", id: "label_server", name: "Server"),
        TaskLabel(color: "purple", id: "label_app", name: "App"),
    ]

    static let detail: TaskDetail = decode(
        """
        {"assignee":{"agentId":"agent_forge","kind":"agent"},"chatId":null,"completedAt":null,
         "createdAt":"2026-10-30T16:00:00Z","createdBy":{"agentId":"agent_zero","kind":"agent"},
         "description":"A leaked Trigger URL can be hammered with valid-looking deliveries.\\n\\n- Limit deliveries per Trigger secret, not per IP.\\n- Return `429` with `Retry-After`.",
         "dueOn":"2026-11-10","id":"task_12","key":"SEC-12","labelIds":["label_server"],"number":12,
         "origin":null,"priority":"high","serverId":"server_preview","state":"todo",
         "title":"Rate-limit Trigger webhook endpoints per secret",
         "updatedAt":"2026-11-03T16:00:00Z","version":3,
         "mentions":[
           {"authorLabel":"Forge","chatId":"chat_security","createdAt":"2026-11-03T14:00:00Z",
            "excerpt":"Should the limit apply to GitHub Triggers too?","messageId":"message_1",
            "place":{"chatId":"chat_security","chatKind":"channel","chatName":"security"}},
           {"authorLabel":"Zero","chatId":"chat_security","createdAt":"2026-10-30T16:12:00Z",
            "excerpt":"Security sweep is done.","messageId":"message_2",
            "place":{"chatId":"chat_security","chatKind":"channel","chatName":"security"}}],
         "reminders":[
           {"anchorChatId":"chat_security","kind":"once","nextFireAt":"2026-11-07T14:00:00Z",
            "reminderId":"reminder_1","title":"Re-check SEC-12 after the Server deploy"}]}
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
