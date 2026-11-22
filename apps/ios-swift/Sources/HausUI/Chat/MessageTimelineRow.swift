import SwiftUI

/// One transcript message: the line it answers or replies to, what it said in
/// the layout its place asks for, its attachments, and the cards that hang off
/// it.
///
/// Split out of `MessageTimelineView` so the screen keeps only the list, the
/// reveal, and the screen-owned registries the rows write into.
struct MessageTimelineRow: View {
    let message: MessagePresentation
    let isContinuation: Bool
    /// Whether the inline-reply reference leads this row (`TranscriptRowGrouping`).
    var showsReplyReference = true
    let isHighlighted: Bool
    /// Held under a finger, or the target of the open action drawer.
    var isPressed = false
    @Binding var attachmentPreview: AttachmentPreview?
    let attachmentTiles: AttachmentImageTileRegistry
    let visualHeights: VisualHeightRegistry
    let reactionBoard: ReactionStickerBoard?
    let onOpenInlineReply: (MessageReplyReferencePresentation) -> Void
    let onOpenAttachment: (MessageAttachmentPresentation) async throws -> URL
    /// The drawer's actions, for VoiceOver.
    var accessibilityActions: MessageRowAccessibilityActions = .none
    var style = TranscriptStyle.roster

    static let avatarSize: CGFloat = 32
    static let avatarSpacing: CGFloat = 10

    var body: some View {
        Group {
            switch MessageRowLayout(style: style, message: message) {
            case .roster: rosterRow
            case .bubble: bubbleRow
            case .prose: proseRow
            }
        }
        .failedSendControls(message)
        .modifier(ReactionThud(stamps: reactionBoard?.stamps(messageID: message.id) ?? [:]))
        .modifier(ReactionObservation(messageID: message.id, reactions: message.reactions, board: reactionBoard))
        .messageRowTint(isHighlighted: isHighlighted, isPressed: isPressed)
    }

    private var rosterRow: some View {
        VStack(alignment: .leading, spacing: 4) {
            lead
            HStack(alignment: .top, spacing: Self.avatarSpacing) {
                if isContinuation {
                    Color.clear.frame(width: Self.avatarSize, height: 1)
                } else {
                    AvatarView(
                        name: message.author.name,
                        url: message.author.avatarURL,
                        presence: message.author.presence,
                        size: Self.avatarSize
                    )
                }
                VStack(alignment: .leading, spacing: 3) {
                    VStack(alignment: .leading, spacing: 2) {
                        if !isContinuation { identity }
                        prose
                    }
                    .messageRowAccessibility(message, actions: accessibilityActions)
                    cards(alignment: .leading)
                }
            }
        }
    }

    private var identity: some View {
        HStack(alignment: .firstTextBaseline, spacing: 6) {
            Text(message.author.name)
                .hausFont(.transcriptAuthor)
                .lineLimit(1)
            Text(message.createdAt, format: .dateTime.hour().minute())
                .hausFont(.transcriptTime)
                .foregroundStyle(HausPlatformColor.faintInk)
        }
    }

    @ViewBuilder
    var prose: some View {
        if !message.prose.isEmpty {
            RichMessageContentView(blocks: message.richBlocks)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    /// A fire is why the Agent spoke, so its line replaces a reply's.
    @ViewBuilder
    var lead: some View {
        if let cause = message.cause {
            // Read inside the identity block's element instead.
            MessageCauseLine(cause: cause)
                .accessibilityHidden(true)
        } else if showsReplyReference, let inlineReply = message.inlineReply {
            InlineReplyPreview(
                reference: inlineReply,
                onOpen: { onOpenInlineReply(inlineReply) }
            )
        }
    }

    /// Everything that hangs off what the message said: visuals, attachments,
    /// the Workers it started, reactions, the failed-send caption, the claim, and Tasks.
    @ViewBuilder
    func cards(alignment: HorizontalAlignment) -> some View {
        let frameAlignment: Alignment = alignment == .trailing ? .trailing : .leading
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
            .frame(maxWidth: .infinity, alignment: frameAlignment)
        }
        ForEach(message.cloudAgents) { agent in
            MessageWorkerLine(worker: agent).padding(.top, 4)
        }
        if !message.isPending {
            ReactionPileView(messageID: message.id, reactions: message.reactions, board: reactionBoard)
                .frame(maxWidth: .infinity, alignment: frameAlignment)
        }
        if message.isSendFailed {
            NotSentCaption()
                .frame(maxWidth: .infinity, alignment: frameAlignment)
        }
        MessageClaimMark(claim: message.claim)
        if !message.tasks.isEmpty {
            TaskPreviewStack(tasks: message.tasks)
        }
    }

    /// Whether anything the message itself says sits above the cards below it.
    private var hasBodyAbove: Bool {
        !(message.prose.isEmpty && message.visuals.isEmpty)
    }
}

/// Which of the three row shapes a message takes in a transcript style.
enum MessageRowLayout: Equatable, Sendable {
    /// Avatar, name, and time, then the message.
    case roster
    /// The person's message, right-aligned in a bubble.
    case bubble
    /// A Captain's reply as full-width prose with a copy control.
    case prose

    init(style: TranscriptStyle, message: MessagePresentation) {
        switch (style, TranscriptSpeaker(message)) {
        case (.roster, _): self = .roster
        case (.assistant, .person): self = .bubble
        case (.assistant, .captain): self = .prose
        }
    }
}
