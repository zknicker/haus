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
                presence: cove.presence,
                kind: .captain
            ),
            content: "I’ll keep the plan tight and surface decisions early. The native shell can diverge at the rendering layer while the Server contract stays shared.",
            createdAt: .now.addingTimeInterval(-120)
        ),
        MessagePresentation(
            id: "message-3",
            author: MessageAuthorPresentation(id: "zach", name: "Zach Knickerbocker", avatarURL: nil),
            content: "Perfect. Let’s prove the daily chat loop in the simulator first.",
            createdAt: .now.addingTimeInterval(-60),
            claim: ClaimPresentation(
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
