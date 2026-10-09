import SwiftUI

struct ThreadPreviewCard: View {
    /// The Thread's anchor Message, which keys the stack's expansion.
    let anchorMessageID: String
    let thread: ThreadPreviewPresentation?
    let task: TaskPresentation?
    var cloudAgents: [CloudAgentPresentation] = []
    let onOpen: () -> Void
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.threadCloudAgentStackExpansion) private var stackExpansion
    /// Stands in for the session's expansion in previews and fixtures.
    @State private var localShowsAllCloudAgents = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ingress
        }
    }

    @ViewBuilder
    private var ingress: some View {
        Button(action: onOpen) {
            VStack(alignment: .leading, spacing: 5) {
                HStack(spacing: 5) {
                    Text(replyLabel).font(.subheadline.weight(.semibold))
                        .contentTransition(reduceMotion ? .opacity : .numericText())
                        .animation(rowAnimation, value: replyLabel)
                    Image(systemName: "chevron.right").font(.caption2.weight(.semibold))
                    if let unread = thread?.unreadCount, unread > 0 {
                        Text("\(unread) new").font(.caption).foregroundStyle(.secondary)
                    }
                }
                .foregroundStyle(.tint)
                .frame(minHeight: 22, alignment: .leading)

                ZStack(alignment: .leading) {
                    if let reply = thread?.latestReply {
                        ThreadPreviewReplyRow(reply: reply)
                            .id(reply)
                            .transition(rowTransition)
                    }
                }
                .clipped()
                .animation(rowAnimation, value: thread?.latestReply)

                ZStack(alignment: .leading) {
                    if let task {
                        HStack(spacing: 5) {
                            TaskStatusDisc(status: TaskStatusShape(task.status), size: 18, surface: HausPlatformColor.inputSurface)
                            Text("Task #\(task.number) · \(task.status.rawValue)").lineLimit(1)
                        }
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .id("\(task.number):\(task.status.rawValue)")
                        .transition(rowTransition)
                    }
                }
                .clipped()
                .animation(rowAnimation, value: task?.status)
                .animation(rowAnimation, value: task?.number)
            }
            .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
            .padding(.vertical, 4)
            .contentShape(Rectangle())
        }
        .buttonStyle(.pressableRow(cornerRadius: HausRadius.medium))
        .accessibilityLabel(accessibilityLabel)
        .padding(.top, 6)
        .anchorPreference(key: ThreadIngressAnchor.self, value: .bounds) { ThreadIngressAnchors(ingress: $0) }

        // The cards carry their own controls, so they sit beside the ingress
        // button rather than inside it.
        if !cloudAgents.isEmpty {
            ThreadCloudAgentStackView(agents: cloudAgents, isExpanded: showsAllCloudAgents, onOpen: onOpen)
                .padding(.top, 4)
        }
    }

    /// Expanding one Thread's stack leaves the others alone, and survives the
    /// row scrolling away because the session, not this view, remembers it.
    private var showsAllCloudAgents: Binding<Bool> {
        guard let stackExpansion else { return $localShowsAllCloudAgents }
        let anchorMessageID = anchorMessageID
        return Binding(
            get: { stackExpansion.isExpanded(anchorMessageID: anchorMessageID) },
            set: { stackExpansion.setExpanded($0, anchorMessageID: anchorMessageID) }
        )
    }

    private var replyLabel: String {
        ThreadPreviewProjection.replyLabel(replyCount: thread?.replyCount ?? 0, hasTask: task != nil)
            ?? "Reply in thread"
    }

    private var rowAnimation: Animation {
        .easeOut(duration: reduceMotion ? 0.15 : 0.22)
    }

    private var rowTransition: AnyTransition {
        reduceMotion ? .opacity : .asymmetric(
            insertion: .offset(y: 6).combined(with: .opacity),
            removal: .offset(y: -6).combined(with: .opacity)
        )
    }

    private var accessibilityLabel: String {
        var parts = [replyLabel]
        if let unread = thread?.unreadCount, unread > 0 { parts.append("\(unread) new") }
        if let reply = thread?.latestReply {
            parts.append("\(reply.author.name): \(RichMessageParser.oneLinePreview(reply.content))")
        }
        if let task { parts.append("Task number \(task.number), \(task.status.rawValue)") }
        return parts.joined(separator: ". ") + ". Open thread"
    }
}

private struct ThreadPreviewReplyRow: View {
    let reply: ThreadReplyPresentation

    var body: some View {
        HStack(spacing: 5) {
            AvatarView(name: reply.author.name, url: reply.author.avatarURL, presence: nil, size: 18)
            (Text(reply.author.name).fontWeight(.medium) + Text(" " + RichMessageParser.oneLinePreview(reply.content)))
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .lineLimit(1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

#Preview {
    ThreadPreviewCard(anchorMessageID: ChatFixtures.messages[2].id, thread: ChatFixtures.messages[2].thread, task: ChatFixtures.messages[2].task, onOpen: {})
        .padding(40)
}
