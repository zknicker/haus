import SwiftUI

/// One message in the Chat transcript: identity, what it says, the visuals it
/// drew, its attachments, and the cards that hang off it.
///
/// Split out of `MessageTimelineView` so the screen keeps only the list, the
/// reveal, and the screen-owned registries the rows write into.
struct MessageTimelineRow: View {
    let message: MessagePresentation
    let isContinuation: Bool
    let isHighlighted: Bool
    @Binding var attachmentPreview: AttachmentPreview?
    let attachmentTiles: AttachmentImageTileRegistry
    let visualHeights: VisualHeightRegistry
    let onOpenThread: () -> Void
    let onOpenAttachment: (MessageAttachmentPresentation) async throws -> URL
    @AppStorage(ShowTasksInChat.storageKey) private var showTasksInChat = false

    var body: some View {
        HStack(alignment: .top, spacing: 11) {
            if isContinuation {
                Color.clear.frame(width: 38, height: 1)
            } else {
                AvatarView(
                    name: message.author.name,
                    url: message.author.avatarURL,
                    presence: message.author.presence,
                    size: 38
                )
            }

            VStack(alignment: .leading, spacing: 3) {
                if !isContinuation {
                    HStack(alignment: .firstTextBaseline, spacing: 7) {
                        Text(message.author.name)
                            .font(.body.weight(.semibold))
                            .lineLimit(1)
                        Text(message.createdAt, format: .dateTime.hour().minute())
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }

                if !message.prose.isEmpty {
                    RichMessageContentView(segments: message.richSegments)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }

                MessageVisualStack(
                    message: message,
                    heights: visualHeights,
                    topPadding: message.prose.isEmpty ? 0 : 3
                )

                if !message.attachments.isEmpty {
                    MessageAttachmentGroup(
                        attachments: message.attachments,
                        isPending: message.isPending,
                        preview: $attachmentPreview,
                        tiles: attachmentTiles,
                        onOpen: onOpenAttachment
                    )
                    .padding(.top, hasBodyAbove ? 3 : 0)
                }

                if let ask = message.ask {
                    // The marker is this Ask's only ingress until somebody
                    // replies: with no replies the row shows no Thread card,
                    // and the answer is written in the Thread either way.
                    AskMark(ask: ask, onOpen: onOpenThread)
                }

                ForEach(message.cloudAgents) { agent in
                    CloudAgentCard(agent: agent).padding(.top, 6)
                }

                if message.isPending {
                    HStack(spacing: 5) {
                        ProgressView().controlSize(.mini)
                        Text("Sending").font(.caption).foregroundStyle(.secondary)
                    }
                    .padding(.top, 2)
                }

                if ThreadPreviewProjection.showsIngress(
                    replyCount: message.thread?.replyCount ?? 0,
                    task: ingressTask
                ) {
                    ThreadPreviewCard(
                        thread: message.thread,
                        task: ingressTask,
                        cloudAgents: message.threadCloudAgents,
                        onOpen: onOpenThread
                    )
                    .id(message.id)
                }
            }
        }
        .overlayPreferenceValue(ThreadIngressAnchor.self) { anchor in
            ThreadIngressConnector(anchor: anchor, isContinuation: isContinuation)
        }
        // The tint is drawn behind the row without changing its layout, so a
        // revealed message keeps the timeline's ordinary rhythm.
        .background {
            RoundedRectangle(cornerRadius: 12)
                .fill(HausPlatformColor.inputSurface)
                .opacity(isHighlighted ? 1 : 0)
                .padding(.horizontal, -8)
                .padding(.vertical, -5)
        }
    }

    /// The task this row states, or nil for a claim the reader has not asked
    /// to see and nobody has replied to. Chat's own preference, per device,
    /// like appearance.
    private var ingressTask: TaskPresentation? {
        ThreadPreviewProjection.ingressTask(
            message.task,
            hasReplies: (message.thread?.replyCount ?? 0) > 0,
            showTasksInChat: showTasksInChat
        )
    }

    /// Whether anything the message itself says sits above the cards below it.
    private var hasBodyAbove: Bool {
        !(message.prose.isEmpty && message.visuals.isEmpty)
    }
}
