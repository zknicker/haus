import SwiftUI

extension ThreadDetailView {
    @ViewBuilder
    func threadRow(_ item: ThreadTranscriptItem) -> some View {
        switch item {
        case .anchor(let message, let hasReplies):
            messageRow(message, emphasized: true)
                .padding(.bottom, hasReplies ? 2 : 0)
        case .taskMetadata(let task, let hasReplies):
            ThreadTaskMetadataView(task: task)
                .padding(.top, 12)
                .padding(.bottom, hasReplies ? 2 : 0)
        case .inlineReplies(let isEmpty):
            if let inlineReplies {
                ThreadInlineRepliesRegion(config: inlineReplies, isEmpty: isEmpty)
            }
        case .inlineReply(let message):
            ThreadMessageRow(
                message: message,
                onOpenAttachment: onOpenAttachment,
                preview: $attachmentPreview,
                tiles: attachmentTiles,
                visualHeights: visualHeights,
                onOpenAgent: onOpenAgent,
                reactionBoard: reactionBoard
            )
            .padding(.top, 4)
        case .threadHeader:
            ThreadRegionHeader(title: "Thread")
        case .reply(let message):
            messageRow(message)
                .padding(.top, 10)
        case .pendingSend:
            ThreadPendingSendRow()
        }
    }

    func messageRow(
        _ message: MessagePresentation,
        emphasized: Bool = false
    ) -> ThreadMessageRow {
        ThreadMessageRow(
            message: message,
            emphasized: emphasized,
            onOpenAttachment: onOpenAttachment,
            preview: $attachmentPreview,
            tiles: attachmentTiles,
            visualHeights: visualHeights,
            onOpenAgent: onOpenAgent,
            onCancelCloudAgent: onCancelCloudAgent,
            reactionBoard: reactionBoard
        )
    }

}
