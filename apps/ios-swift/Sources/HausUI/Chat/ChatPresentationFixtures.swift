import Foundation

public enum ChatFixtures {
    public static let cove = AgentPresentation(
        id: "agent-cove",
        name: "Cove",
        avatarURL: nil,
        presence: .idle
    )

    public static let server = ServerPresentation(name: "Haus")

    public static let chats = [
        ChatPresentation(id: "all", title: "all", kind: .channel),
        ChatPresentation(
            id: "product",
            title: "product",
            kind: .channel,
            unreadCount: 3,
            appearance: ChannelAppearance(icon: "RocketIcon", color: "violet"),
            description: "Roadmap, specs, and launch planning."
        ),
        ChatPresentation(
            id: "onboarding",
            title: "onboarding-owner",
            kind: .channel,
            appearance: ChannelAppearance(icon: "CompassIcon", color: "amber")
        ),
        ChatPresentation(id: "cove", title: "Cove", kind: .agentDirectMessage(cove)),
    ]

    public static let messages = [
        MessagePresentation(
            id: "message-1",
            author: MessageAuthorPresentation(id: "zach", name: "Zach Knickerbocker", avatarURL: nil),
            content: "Morning team — what should we focus on today?",
            createdAt: .now.addingTimeInterval(-180)
        ),
        MessagePresentation(
            id: "message-2",
            author: MessageAuthorPresentation(
                id: cove.id,
                name: cove.name,
                avatarURL: cove.avatarURL,
                presence: cove.presence
            ),
            content: "I’ll keep the plan tight and surface decisions early. The native shell can diverge at the rendering layer while the Server contract stays shared.",
            createdAt: .now.addingTimeInterval(-120),
            thread: ThreadPreviewPresentation(
                threadChatID: "thread-message-2",
                replyCount: 3,
                unreadCount: 1,
                recentReplies: [
                    ThreadReplyPresentation(
                        id: "reply-2a",
                        author: MessageAuthorPresentation(
                            id: cove.id,
                            name: cove.name,
                            avatarURL: cove.avatarURL,
                            presence: cove.presence
                        ),
                        content: "Pulling the anchor summary into the preview now.",
                        createdAt: .now.addingTimeInterval(-110)
                    ),
                    ThreadReplyPresentation(
                        id: "reply-2b",
                        author: MessageAuthorPresentation(
                            id: "zach",
                            name: "Zach Knickerbocker",
                            avatarURL: nil
                        ),
                        content: "Let’s use one compact preview and keep the full conversation in the thread.",
                        createdAt: .now.addingTimeInterval(-75)
                    ),
                    ThreadReplyPresentation(
                        id: "reply-2c",
                        author: MessageAuthorPresentation(
                            id: cove.id,
                            name: cove.name,
                            avatarURL: cove.avatarURL,
                            presence: cove.presence
                        ),
                        content: "Agreed — the rows read as the thread without opening it.",
                        createdAt: .now.addingTimeInterval(-40)
                    ),
                ]
            )
        ),
        MessagePresentation(
            id: "message-3",
            author: MessageAuthorPresentation(id: "zach", name: "Zach Knickerbocker", avatarURL: nil),
            content: "Perfect. Let’s prove the daily chat loop in the simulator first.",
            createdAt: .now.addingTimeInterval(-60),
            thread: ThreadPreviewPresentation(
                threadChatID: "thread-message-3",
                replyCount: 3,
                unreadCount: 0,
                recentReplies: [
                    ThreadReplyPresentation(
                        id: "reply-3",
                        author: MessageAuthorPresentation(
                            id: cove.id,
                            name: cove.name,
                            avatarURL: cove.avatarURL,
                            presence: cove.presence
                        ),
                        content: "The Server contract is already carrying the task and reply data we need.",
                        createdAt: .now.addingTimeInterval(-25)
                    ),
                ]
            ),
            task: TaskPresentation(
                number: 42,
                status: .inProgress,
                assignee: nil,
                creator: MessageAuthorPresentation(
                    id: "zach",
                    name: "Zach Knickerbocker",
                    avatarURL: nil
                )
            )
        ),
    ]
}
