import SwiftUI

let searchRowInsets = EdgeInsets(top: 10, leading: 16, bottom: 10, trailing: 16)

struct ChatSearchResultRow: View {
    let chat: ChatPresentation

    var body: some View {
        HStack(spacing: 12) {
            switch chat.kind {
            case .channel:
                ChannelIconBox(appearance: chat.appearance, size: 36, glyphSize: 22)
            case .agentDirectMessage(let agent):
                AvatarView(name: agent.name, url: agent.avatarURL, presence: agent.presence, size: 36)
            case .humanDirectMessage(let human):
                AvatarView(name: human.name, url: human.avatarURL, presence: nil, size: 36)
            }

            Text(chat.title)
                .font(.body)
                .fontWeight(chat.unreadCount > 0 ? .semibold : .regular)
                .foregroundStyle(.primary)
                .lineLimit(1)

            Spacer(minLength: 8)

            if chat.unreadCount > 0 { UnreadDot() }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
        .accessibilityLabel(chat.unreadCount > 0 ? "\(chat.title), unread" : chat.title)
    }
}

struct MessageSearchResultRow: View {
    let result: MessageSearchResultPresentation

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            AvatarView(name: result.authorName, url: result.authorAvatarURL, size: 36)

            VStack(alignment: .leading, spacing: 3) {
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    Text(result.authorName)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(.primary)
                        .lineLimit(1)
                        .layoutPriority(1)
                    Text(chatContextLabel)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                    Spacer(minLength: 4)
                    Text(HausCompactRelativeTime.label(for: result.createdAt))
                        .font(.caption)
                        .foregroundStyle(.tertiary)
                }

                Text(result.content)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(result.authorName) in \(result.chatName): \(result.content)")
    }

    private var chatContextLabel: String {
        switch result.chatKind {
        case .channel: "in #\(result.chatName)"
        case .directMessage: "in DM"
        }
    }
}

private enum ServerSearchPreviewFixtures {
    static let results = [
        MessageSearchResultPresentation(
            id: "search-1",
            authorName: "Cove",
            chatID: "chat-cove",
            chatName: "product",
            content: "The Server contract is already carrying the task and reply data we need.",
            createdAt: .now.addingTimeInterval(-900)
        ),
        MessageSearchResultPresentation(
            id: "search-2",
            authorName: "Zach Knickerbocker",
            chatID: "chat-product",
            chatName: "product",
            content: "Let's keep the native shell focused on the daily chat loop.",
            createdAt: .now.addingTimeInterval(-3_600)
        ),
    ]
}

#Preview("Search results") {
    ServerSearchView(
        chats: ChatFixtures.chats,
        searchMessages: { _ in ServerSearchPreviewFixtures.results },
        onSelectChat: { _ in },
        onSelectMessage: { _ in true }
    )
}

#Preview("Search error") {
    ServerSearchView(
        chats: ChatFixtures.chats,
        searchMessages: { _ in
            struct PreviewError: LocalizedError {
                var errorDescription: String? { "The Server could not be reached." }
            }
            throw PreviewError()
        },
        onSelectChat: { _ in },
        onSelectMessage: { _ in true }
    )
}
