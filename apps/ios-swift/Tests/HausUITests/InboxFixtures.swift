import Foundation
import HausModels
@testable import HausUI

/// The Server reads the Inbox projects, as the wire actually returns them. They
/// are decoded rather than constructed so a row test still stands on the shape
/// the Server sends.
enum InboxFixtures {
    /// The App layer's directory, as the rows see it: an Agent it knows, and
    /// nothing else.
    static func directory(
        agentID: String?,
        userID: String?
    ) -> MessageAuthorPresentation? {
        if agentID == "agent_blippy" {
            return MessageAuthorPresentation(
                id: "agent_blippy",
                name: "Blippy",
                avatarURL: nil,
                presence: .working
            )
        }
        if let userID {
            return MessageAuthorPresentation(id: userID, name: "Marlow", avatarURL: nil)
        }
        return nil
    }

    /// One open Ask as `ask.listOpen` returns it. An Ask posted inside a Thread
    /// names that Thread's anchor Message, which is how a Thread screen tells
    /// its own Asks from every other one the viewer holds.
    static func openAsk(
        chatKind: HausModels.ChatKind = .channel,
        chatName: String? = "onboarding",
        summary: String = "Friday or Monday",
        id: String = "ask_1",
        messageID: String = "message_ask",
        createdAt: String = "2026-09-11T09:00:00.000Z",
        status: AskStatus = .open,
        options: [String] = ["Friday"],
        threadAnchorMessageID: String? = nil
    ) -> OpenAsk {
        decode(
            """
            {"ask":{"addresseeUserId":"user_1","agentId":"agent_blippy","answerMessageId":null,
              "answeredAt":null,"answeredBy":null,"chatId":"chat_1",
              "createdAt":"\(createdAt)","id":"\(id)","messageId":"\(messageID)",
              "options":[\(options.map(quoted).joined(separator: ","))],
              "status":"\(status.rawValue)","summary":\(quoted(summary)),
              "title":"Pick a rollout window"},
             "chatKind":"\(chatKind.rawValue)","chatName":\(chatName.map(quoted) ?? "null"),
             "chatPeerUserId":null,"conversationChatId":"chat_1",
             "message":\(message(id: messageID, createdAt: createdAt)),
             "threadAnchorMessage":\(threadAnchorMessageID.map { message(id: $0) } ?? "null"),
             "threadChatId":"chat_thread"}
            """
        )
    }

    static func activeWork(startedAt: Date) -> ActiveCloudAgentWork {
        decode(
            """
            {"chatKind":"channel","chatName":"all","chatPeerUserId":null,
             "conversationChatId":"chat_1","message":\(message(id: "message_work")),
             "threadAnchorMessage":null,"threadChatId":"chat_thread",
             "work":{"activity":null,"agentId":"agent_blippy","cancelRequestedAt":null,
               "chatId":"chat_thread","createdAt":"2026-09-11T09:00:00.000Z","id":"work_1",
               "messageId":"message_work","provider":"cursor","providerUrl":null,
               "repository":"zknicker/haus","runs":[],
               "startedAt":\(quoted(HausISO8601.string(from: startedAt))),
               "startingRef":"main","status":"running","terminalAt":null,
               "title":"Ship the iPhone build","updatedAt":"2026-09-11T09:00:00.000Z"}}
            """
        )
    }

    static func task(
        number: Int,
        origin: TaskOrigin,
        status: TaskStatus,
        tier: TaskTier,
        live: Bool = false
    ) -> TaskListItem {
        decode(
            """
            {"chatKind":"channel","chatName":"all","chatPeerUserId":null,
             "message":\(message(id: "message_task_\(number)", content: "Rotate the signing key")),
             "task":{"assigneeAgentId":"agent_blippy","assigneeUserId":null,"chatId":"chat_1",
               "claimedAt":"2026-09-11T09:00:00.000Z","createdAt":"2026-09-11T08:00:00.000Z",
               "createdByAgentId":"agent_blippy","createdByUserId":null,"labels":[],
               "live":\(live),"messageId":"message_task_\(number)","number":\(number),
               "origin":"\(origin.rawValue)","priority":"none","status":"\(status.rawValue)",
               "threadChatId":"chat_thread","tier":"\(tier.rawValue)",
               "updatedAt":"2026-09-11T09:00:00.000Z","version":1},
             "threadSummary":{"anchorMessageId":"message_task_\(number)","followed":false,
               "latestReplyAt":null,"recentReplies":[],"replyCount":0,
               "threadChatId":"chat_thread","unreadCount":0}}
            """
        )
    }

    static func chat(
        id: String,
        name: String,
        isChannel: Bool = true,
        peerDisplayName: String? = nil,
        unreadCount: Int = 1,
        lastActivityAt: Date? = Date(timeIntervalSince1970: 1_800_000_000),
        lastMessage: ChatLastMessage? = nil
    ) -> InboxConversation {
        InboxConversation(
            id: id,
            name: name,
            isChannel: isChannel,
            mark: isChannel
                ? .channel(ChannelAppearance(icon: nil, color: nil))
                : .identity(name: name, avatarURL: nil, presence: nil),
            peerDisplayName: peerDisplayName,
            unreadCount: unreadCount,
            lastActivityAt: lastActivityAt,
            lastMessage: lastMessage
        )
    }

    static func lastMessage(author: String, content: String) -> ChatLastMessage {
        ChatLastMessage(
            authorDisplayName: author,
            content: content,
            createdAt: Date(timeIntervalSince1970: 1_800_000_000)
        )
    }

    static func week(
        id: String,
        name: String,
        tokens: Int,
        activity: String? = nil
    ) -> InboxAgentWeek {
        InboxAgentWeek(
            id: id,
            name: name,
            avatarURL: nil,
            presence: nil,
            days: [0, 0, 0, 0, 0, 0, tokens],
            totalTokens: tokens,
            activityLabel: activity
        )
    }

    private static func message(
        id: String,
        content: String = "Ship the iPhone build",
        createdAt: String = "2026-09-11T09:00:00.000Z"
    ) -> String {
        """
        {"attachments":[],"author":{"agentId":"agent_blippy","kind":"agent",
          "profile":{"avatarUrl":null,"deleted":false,"description":null,
            "displayName":"Blippy"}},
         "chatId":"chat_1","content":\(quoted(content)),
         "createdAt":"\(createdAt)","id":"\(id)","nonce":"nonce_\(id)",
         "runId":null,"sequence":1,"serverId":"server_1","task":null}
        """
    }

    private static func quoted(_ value: String) -> String {
        let escaped = value
            .replacingOccurrences(of: "\\", with: "\\\\")
            .replacingOccurrences(of: "\"", with: "\\\"")
            .replacingOccurrences(of: "\n", with: "\\n")
        return "\"\(escaped)\""
    }

    private static func decode<Value: Decodable>(_ json: String) -> Value {
        do {
            return try HausJSON.decoder().decode(Value.self, from: Data(json.utf8))
        } catch {
            preconditionFailure("Invalid Inbox fixture: \(error)")
        }
    }
}
