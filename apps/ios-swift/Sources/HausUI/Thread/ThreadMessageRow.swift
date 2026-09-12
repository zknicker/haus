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
    var onCancelCloudAgent: ((String) async throws -> Void)?

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            AvatarView(
                name: message.author.name,
                url: message.author.avatarURL,
                presence: message.author.presence,
                size: 36
            )

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
                        segments: message.richSegments,
                        textStyle: emphasized ? .body : .subheadline
                    )
                    .foregroundStyle(.primary)
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
                        preview: preview,
                        tiles: tiles,
                        onOpen: onOpenAttachment
                    )
                }

                if let ask = message.ask {
                    AskMark(ask: ask).padding(.top, 4)
                }

                ForEach(message.cloudAgents) { agent in
                    CloudAgentCard(agent: agent, onCancel: onCancelCloudAgent).padding(.top, 6)
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
        .padding(emphasized ? 12 : 0)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            emphasized ? HausPlatformColor.inputSurface : .clear,
            in: .rect(cornerRadius: emphasized ? 16 : 0)
        )
    }
}
