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
    /// Held under a finger, or the target of the open action drawer.
    var isPressed = false
    @Binding var attachmentPreview: AttachmentPreview?
    let attachmentTiles: AttachmentImageTileRegistry
    let visualHeights: VisualHeightRegistry
    let reactionBoard: ReactionStickerBoard?
    let onOpenThread: () -> Void
    let onOpenInlineReply: (MessageReplyReferencePresentation) -> Void
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
                    if let inlineReply = message.inlineReply {
                        InlineReplyPreview(
                            reference: inlineReply,
                            onOpen: { onOpenInlineReply(inlineReply) }
                        )
                    }

                    RichMessageContentView(blocks: message.richBlocks)
                        .frame(maxWidth: .infinity, alignment: .leading)
                } else if let inlineReply = message.inlineReply {
                    InlineReplyPreview(
                        reference: inlineReply,
                        onOpen: { onOpenInlineReply(inlineReply) }
                    )
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

                ForEach(message.cloudAgents) { agent in
                    CloudAgentCard(agent: agent).padding(.top, 6)
                }

                if !message.isPending {
                    ReactionPileView(
                        messageID: message.id,
                        reactions: message.reactions,
                        board: reactionBoard
                    )
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
        .modifier(ReactionThud(stamps: reactionBoard?.stamps(messageID: message.id) ?? [:]))
        .modifier(ReactionObservation(messageID: message.id, reactions: message.reactions, board: reactionBoard))
        .overlayPreferenceValue(ThreadIngressAnchor.self) { anchor in
            ThreadIngressConnector(anchor: anchor, isContinuation: isContinuation)
        }
        .messageRowTint(isHighlighted: isHighlighted, isPressed: isPressed)
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
