import SwiftUI

/// The Chat canvas's floating header: navigation, the Chat's identity and
/// title, and its actions, with who is answering hung just underneath. While
/// Server is unreachable the title reads "Connecting…" (`ConnectionOutage`).
struct ChatScreenHeader: View {
    let chat: ChatDestination
    let isConnected: Bool
    let onOpenSidebar: () -> Void
    let onOpenChatDetails: () -> Void
    let onOpenSearch: () -> Void
    let onCall: (() -> Void)?

    @State private var showsOutage = false

    var body: some View {
        ChromeHeader {
            GlassChromeButton(.sidebar, label: "Open navigation", action: onOpenSidebar)
        } center: {
            Button(action: onOpenChatDetails) {
                HStack(spacing: 7) {
                    chatIdentity
                    title
                    Image(systemName: "chevron.right")
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(.secondary)
                }
                .frame(maxWidth: 220)
            }
            .buttonStyle(.plain)
            // The header caps its text size like a navigation bar does, so a
            // reader at an accessibility size gets the system's enlarged
            // preview on a long press instead.
            .accessibilityShowsLargeContentViewer {
                Text(chat.title)
            }
        } trailing: {
            HStack(spacing: 8) {
                if let onCall {
                    GlassChromeButton(.system("phone"), label: "Call Agent", action: onCall)
                }
                GlassChromeButton(.icon(.search), label: "Search messages", action: onOpenSearch)
            }
        }
        .overlay(alignment: .top) { engagement }
        .connectionOutage(isConnected: isConnected, showsOutage: $showsOutage)
    }

    private var title: some View {
        Text(showsOutage ? ConnectionOutage.title : chat.title)
            .font(.headline)
            .foregroundStyle(showsOutage ? .secondary : .primary)
            .lineLimit(1)
            .contentTransition(.opacity)
            .animation(.easeOut(duration: 0.2), value: showsOutage)
            .accessibilityLabel(showsOutage ? "\(chat.title), connecting" : chat.title)
    }

    /// Who is answering: an overlay under the title, so it never moves the transcript.
    @ViewBuilder
    private var engagement: some View {
        if let chatID = chat.durableChat?.id {
            HeaderEngagement(chatID: chatID, style: chat.kind.engagementStyle)
                .fixedSize(horizontal: false, vertical: true)
                .offset(y: HausChrome.headerHeight - 8)
        }
    }

    @ViewBuilder
    private var chatIdentity: some View {
        switch chat.kind {
        case .channel:
            ChannelIconBox(appearance: chat.appearance, size: 26)
        case .agentDirectMessage(let agent):
            AvatarView(name: agent.name, url: agent.avatarURL, presence: agent.presence, size: 30)
        case .humanDirectMessage(let human):
            AvatarView(name: human.name, url: human.avatarURL, presence: nil, size: 30)
        }
    }
}
