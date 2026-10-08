import SwiftUI

struct ThreadMessageRow: View {
    let message: MessagePresentation
    var emphasized = false
    var onOpenAttachment: (MessageAttachmentPresentation) async throws -> URL = { attachment in
        guard let localURL = attachment.localURL else { throw CancellationError() }
        return localURL
    }
    var preview: Binding<AttachmentPreview?> = .constant(nil)
    var tiles: AttachmentImageTileRegistry?
    /// The screen's, not the row's — see `VisualHeightRegistry`.
    let visualHeights: VisualHeightRegistry
    var onOpenAgent: (String) -> Void = { _ in }
    var reactionBoard: ReactionStickerBoard?
    /// Held under a finger, or the target of the open action drawer.
    var isPressed = false
    /// The drawer's actions, for VoiceOver.
    var accessibilityActions: MessageRowAccessibilityActions = .none

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            AvatarView(
                name: message.author.name,
                url: message.author.avatarURL,
                presence: message.author.presence,
                size: 36
            )

            VStack(alignment: .leading, spacing: 3) {
                VStack(alignment: .leading, spacing: 3) {
                    HStack(alignment: .firstTextBaseline, spacing: 7) {
                        Text(message.author.name)
                            .font(.body.weight(.semibold))
                            .lineLimit(1)
                        Text(message.createdAt, format: .dateTime.hour().minute())
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }

                    if !message.prose.isEmpty {
                        RichMessageContentView(
                            blocks: message.richBlocks,
                            textStyle: emphasized ? .body : .subheadline
                        )
                        .foregroundStyle(.primary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }
                }
                .messageRowAccessibility(message, actions: accessibilityActions)

                MessageVisualStack(
                    message: message,
                    heights: visualHeights,
                    topPadding: message.prose.isEmpty ? 0 : 3
                )

                if !message.attachments.isEmpty {
                    MessageAttachmentGroup(
                        attachments: message.attachments,
                        isPending: message.isPending,
                        preview: preview,
                        tiles: tiles,
                        onOpen: onOpenAttachment
                    )
                }

                ForEach(message.cloudAgents) { agent in
                    CloudAgentCard(agent: agent).padding(.top, 6)
                }

                if !message.isPending {
                    ReactionPileView(messageID: message.id, reactions: message.reactions, board: reactionBoard)
                }

                if message.isPending {
                    HStack(spacing: 5) {
                        ProgressView()
                            .controlSize(.mini)
                        Text("Sending")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    .padding(.top, 2)
                }
            }
        }
        .modifier(ReactionThud(stamps: reactionBoard?.stamps(messageID: message.id) ?? [:]))
        .modifier(ReactionObservation(messageID: message.id, reactions: message.reactions, board: reactionBoard))
        .padding(emphasized ? 12 : 0)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            emphasized ? HausPlatformColor.inputSurface : .clear,
            in: .rect(cornerRadius: emphasized ? 16 : 0)
        )
        .messageRowTint(isPressed: isPressed, card: emphasized)
    }
}
