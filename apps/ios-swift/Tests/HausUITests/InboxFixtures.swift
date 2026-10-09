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

    static func activeWork(
        startedAt: Date, title: String = "Ship the iPhone build", job: String? = nil
    ) -> ActiveCloudAgentWork {
        let started = quoted(HausISO8601.string(from: startedAt))
        let job = job ?? #"{"followUp":null,"startedAt":\#(started),"state":"working"}"#
        return decode(
            """
            {"chatKind":"channel","chatName":"all","chatPeerUserId":null,
             "conversationChatId":"chat_1","message":\(message(id: "message_work")),
             "threadAnchorMessage":null,"threadChatId":"chat_thread",
             "work":{"activity":null,"agentId":"agent_blippy","cancelRequestedAt":null,
               "chatId":"chat_thread","createdAt":"2026-09-11T09:00:00.000Z","id":"work_1",
               "messageId":"message_work","provider":"cursor","providerUrl":null,
               "job":\(job),"repository":"zknicker/haus","runs":[],
               "startedAt":\(started),
               "startingRef":"main","status":"running","terminalAt":null,
               "title":\(quoted(title)),"updatedAt":"2026-09-11T09:00:00.000Z"}}
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
    ) -> InboxUnreadChat {
        InboxUnreadChat(
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
