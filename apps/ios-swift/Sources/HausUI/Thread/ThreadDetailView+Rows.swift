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
                reactionBoard: reactionBoard,
                isPressed: isPressed(message),
                accessibilityActions: accessibilityActions(for: message)
            )
            .padding(.top, 4)
        case .threadHeader:
            ThreadRegionHeader(title: "Thread")
        case .reply(let message):
            messageRow(message)
                .padding(.top, 10)
        case .pendingSend:
            ThreadPendingSendRow()
        case .dayDivider(let date, _):
            TranscriptDayDivider(date: date)
                .padding(.top, 14)
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
            reactionBoard: reactionBoard,
            isPressed: isPressed(message),
            accessibilityActions: accessibilityActions(for: message)
        )
    }

    /// Inside the Thread the drawer offers reactions and copying; VoiceOver
    /// gets the same.
    func accessibilityActions(for message: MessagePresentation) -> MessageRowAccessibilityActions {
        .forMessage(
            message,
            canReplyInline: false,
            canOpenThread: false,
            onReact: { actionMessage = message },
            onReply: {},
            onOpenThread: {}
        )
    }

    /// The message a row's long press opens the drawer for: a durable anchor
    /// or reply, never the task facts or a send still in flight.
    static func drawerMessage(for item: ThreadTranscriptItem) -> MessagePresentation? {
        switch item {
        case .anchor(let message, _), .inlineReply(let message), .reply(let message):
            message.isPending ? nil : message
        case .taskMetadata, .inlineReplies, .threadHeader, .pendingSend, .dayDivider:
            nil
        }
    }
}
