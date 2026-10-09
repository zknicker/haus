import SwiftUI

struct ThreadPreviewCard: View {
    let thread: ThreadPreviewPresentation?
    let task: TaskPresentation?
    var cloudAgents: [CloudAgentPresentation] = []
    let onOpen: () -> Void
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
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

                VStack(alignment: .leading, spacing: 5) {
                    ForEach(cloudAgentSummaries) { summary in
                        ZStack(alignment: .leading) {
                            HStack(spacing: 5) {
                                CloudAgentMark(size: 16, style: .glyph)
                                    .frame(width: 18, height: 18)
                                ViewThatFits(in: .horizontal) {
                                    Text(summary.headline).lineLimit(1)
                                    if let compact = summary.compactHeadline {
                                        Text(compact).lineLimit(1)
                                    }
                                }
                                .layoutPriority(1)
                                if let detail = summary.detail {
                                    Text(detail).lineLimit(1)
                                }
                            }
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                            .id([summary.headline, summary.detail])
                            .transition(rowTransition)
                        }
                        .transition(rowTransition)
                    }
                }
                .clipped()
                .animation(rowAnimation, value: cloudAgentSummaries.map { [$0.id, $0.headline, $0.detail] })
            }
            .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
            .padding(.vertical, 4)
            .contentShape(Rectangle())
        }
        .buttonStyle(.pressableRow(cornerRadius: HausRadius.medium))
        .accessibilityLabel(accessibilityLabel)
        .padding(.top, 6)
        .anchorPreference(key: ThreadIngressAnchor.self, value: .bounds) { $0 }
    }

    private var replyLabel: String {
        ThreadPreviewProjection.replyLabel(replyCount: thread?.replyCount ?? 0, hasTask: task != nil)
            ?? "Reply in thread"
    }

    /// One row per provider; a fan-out collapses to a count and a status breakdown.
    private var cloudAgentSummaries: [ThreadCloudAgentSummary] {
        ThreadCloudAgentSummary.summarize(cloudAgents)
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
        parts += cloudAgentSummaries.map(\.accessibilityText)
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
    ThreadPreviewCard(thread: ChatFixtures.messages[2].thread, task: ChatFixtures.messages[2].task, onOpen: {})
        .padding(40)
}
