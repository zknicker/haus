import Foundation
import HausModels

/// A board, its Tasks, and one Task's detail, as the wire returns them. Decoded
/// rather than constructed, so a preview stands on the shape the Server sends.
enum TaskPreviewFixtures {
    static let boards: [Board] = decode(
        """
        [{"archivedAt":null,"createdAt":"2026-10-30T16:00:00Z","id":"board_security","key":"SEC",
          "name":"Security","openTaskCount":4,"serverId":"server_preview",
          "updatedAt":"2026-10-30T16:00:00Z","version":1,
          "columns":[
            {"category":"backlog","id":"col_backlog","name":"Backlog","position":0},
            {"category":"todo","id":"col_todo","name":"Todo","position":1},
            {"category":"active","id":"col_active","name":"In progress","position":2},
            {"category":"done","id":"col_done","name":"Done","position":3},
            {"category":"canceled","id":"col_canceled","name":"Canceled","position":4}]},
         {"archivedAt":null,"createdAt":"2026-09-01T16:00:00Z","id":"board_general","key":"GEN",
          "name":"General","openTaskCount":0,"serverId":"server_preview",
          "updatedAt":"2026-09-01T16:00:00Z","version":1,
          "columns":[
            {"category":"todo","id":"col_gen_todo","name":"Todo","position":0},
            {"category":"active","id":"col_gen_active","name":"In progress","position":1},
            {"category":"done","id":"col_gen_done","name":"Done","position":2}]}]
        """
    )

    static let labels: [TaskLabel] = [
        TaskLabel(color: "blue", id: "label_server", name: "Server"),
        TaskLabel(color: "purple", id: "label_app", name: "App"),
    ]

    static let assignees: [TaskAssigneeOption] = [
        TaskAssigneeOption(actor: .agent(agentID: "agent_forge"), name: "Forge", avatarURL: nil),
        TaskAssigneeOption(actor: .agent(agentID: "agent_blippy"), name: "Blippy", avatarURL: nil),
        TaskAssigneeOption(actor: .user(userID: "user_zach"), name: "Zach", avatarURL: nil),
    ]

    static let tasks: [BoardTask] = [
        task(12, "Rate-limit Trigger webhook endpoints per secret", column: "col_todo", category: "todo",
             priority: "high", assignee: agent("agent_forge"), labels: #"["label_server"]"#, due: #""2026-11-10""#),
        task(21, "Require SameSite=Strict on the desktop session cookie", column: "col_todo", category: "todo",
             priority: "medium", assignee: user("user_zach"), labels: #"["label_app"]"#),
        task(8, "Rotate Computer pairing tokens on revoke", column: "col_active", category: "active",
             priority: "urgent", assignee: agent("agent_forge")),
        task(15, "Escape Thread quotes in message hover cards", column: "col_active", category: "active",
             priority: "high", assignee: agent("agent_forge"), labels: #"["label_app"]"#),
        task(3, "Drop raw tokens from the Server startup log", column: "col_done", category: "done",
             priority: "high", completedAt: #""2026-11-01T16:00:00Z""#),
    ]

    static let detail: BoardTaskDetail = decode(
        """
        {"assignee":{"agentId":"agent_forge","kind":"agent"},"boardId":"board_security",
         "category":"todo","columnId":"col_todo","completedAt":null,
         "createdAt":"2026-10-30T16:00:00Z","createdBy":{"agentId":"agent_zero","kind":"agent"},
         "description":"A leaked Trigger URL can be hammered with valid-looking deliveries.\\n\\n- Limit deliveries per Trigger secret, not per IP.\\n- Return `429` with `Retry-After`.",
         "dueOn":"2026-11-10","id":"task_12","key":"SEC-12","labelIds":["label_server"],"number":12,
         "priority":"high","serverId":"server_preview",
         "title":"Rate-limit Trigger webhook endpoints per secret",
         "updatedAt":"2026-11-03T16:00:00Z","version":3,
         "mentions":[
           {"authorLabel":"Forge","chatId":"chat_thread","createdAt":"2026-11-03T14:00:00Z",
            "excerpt":"Should the limit apply to GitHub Triggers too?","messageId":"message_1",
            "place":{"chatId":"chat_security","chatKind":"channel","chatName":"security",
                     "threadAnchorMessageId":"message_anchor"}},
           {"authorLabel":"Zero","chatId":"chat_security","createdAt":"2026-10-30T16:12:00Z",
            "excerpt":"Security sweep is done: 33 tasks on the Security board.","messageId":"message_2",
            "place":{"chatId":"chat_security","chatKind":"channel","chatName":"security",
                     "threadAnchorMessageId":null}}],
         "reminders":[
           {"anchorChatId":"chat_security","kind":"once","nextFireAt":"2026-11-07T14:00:00Z",
            "reminderId":"reminder_1","title":"Re-check SEC-12 after the Server deploy"}]}
        """
    )

    private static func agent(_ id: String) -> String { #"{"agentId":"\#(id)","kind":"agent"}"# }
    private static func user(_ id: String) -> String { #"{"kind":"user","userId":"\#(id)"}"# }

    private static func task(
        _ number: Int,
        _ title: String,
        column: String,
        category: String,
        priority: String,
        assignee: String = "null",
        labels: String = "[]",
        due: String = "null",
        completedAt: String = "null"
    ) -> BoardTask {
        decode(
            """
            {"assignee":\(assignee),"boardId":"board_security","category":"\(category)",
             "columnId":"\(column)","completedAt":\(completedAt),
             "createdAt":"2026-10-30T16:00:00Z","createdBy":{"agentId":"agent_zero","kind":"agent"},
             "description":"","dueOn":\(due),"id":"task_\(number)","key":"SEC-\(number)",
             "labelIds":\(labels),"number":\(number),"priority":"\(priority)",
             "serverId":"server_preview","title":"\(title)",
             "updatedAt":"2026-11-03T16:00:00Z","version":1}
            """
        )
    }

    private static func decode<Value: Decodable>(_ json: String) -> Value {
        do {
            return try HausJSON.decoder().decode(Value.self, from: Data(json.utf8))
        } catch {
            preconditionFailure("Invalid task preview fixture: \(error)")
        }
    }
}
