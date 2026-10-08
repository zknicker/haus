import SwiftUI

/// One Chat in the sidebar: its glyph, its title, the unread disc in the
/// gutter, and a long-press menu with the row's own actions — the same Mark
/// Read the Inbox offers, and the Chat's details.
struct SidebarChatRow: View {
    let chat: ChatDestination
    let isSelected: Bool
    let metrics: SidebarRowMetrics
    let onSelect: () -> Void
    /// Absent when the Chat has nothing unread or no durable record to mark.
    let onMarkRead: (() -> Void)?
    let onOpenDetails: () -> Void

    var body: some View {
        Button(action: onSelect) {
            HStack(spacing: 10) {
                SidebarChatGlyph(chat: chat, size: metrics.glyph)
                Text(chat.title)
                    .fontWeight(isUnread ? .semibold : .regular)
                    .lineLimit(metrics.titleLineLimit)
                Spacer(minLength: 0)
            }
            .sidebarRowFrame(metrics, isSelected: isSelected)
            .sidebarUnreadDot(isUnread, listInset: metrics.listInset, glyphInset: metrics.capsuleBleed)
            // The label's own drawing stops at the title, so without this the
            // tappable area is the glyph and the text rather than the row.
            .contentShape(Rectangle())
        }
        .buttonStyle(.pressableRow(cornerRadius: metrics.pressRadius))
        #if os(iOS)
        // The lifted row keeps the selection capsule's shape.
        .contentShape(.contextMenuPreview, .capsule)
        #endif
        .contextMenu {
            if let onMarkRead {
                Button(action: onMarkRead) {
                    Label("Mark Read", systemImage: "envelope.open")
                }
            }
            Button(action: onOpenDetails) {
                Label(detailsTitle, systemImage: "info.circle")
            }
        }
        .accessibilityLabel(isUnread ? "\(chat.title), unread" : chat.title)
    }

    private var isUnread: Bool { chat.unreadCount > 0 }

    private var detailsTitle: String {
        if case .channel = chat.kind { "Channel Details" } else { "Details" }
    }
}

/// A Chat's identity at sidebar size: a channel's icon box or a person's face.
struct SidebarChatGlyph: View {
    let chat: ChatDestination
    let size: CGFloat

    var body: some View {
        switch chat.kind {
        case .channel:
            ChannelIconBox(appearance: chat.appearance, size: size)
        case .agentDirectMessage(let agent):
            AvatarView(name: agent.name, url: agent.avatarURL, presence: agent.presence, size: size)
        case .humanDirectMessage(let human):
            AvatarView(name: human.name, url: human.avatarURL, presence: nil, size: size)
        }
    }
}
