import SwiftUI

extension ThreadDetailView {
    @ViewBuilder
    func threadRow(_ item: ThreadTranscriptItem) -> some View {
        switch item {
        case .anchor(let message, let hasReplies):
            messageRow(message, emphasized: true)
                .padding(.bottom, hasReplies ? 2 : 0)
        case .taskMetadata(let task, let hasReplies):
            // Opened for a reply's task, the title no longer names the
            // anchor's, so the card names its own.
            ThreadTaskMetadataView(
                task: task,
                namesTask: ThreadOpening.opensForReplyTask(anchor: anchor, taskMessageID: taskMessageID)
            )
                .padding(.top, 12)
                .padding(.bottom, hasReplies ? 2 : 0)
        case .inlineReplies:
            if let inlineReplies {
                ThreadInlineRepliesLoader(config: inlineReplies)
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
            .padding(.top, 10)
        case .reply(let message):
            messageRow(message, marksTask: true, isOpenedTask: message.id == taskMessageID)
                .padding(.top, 10)
        case .dayDivider(let date):
            TranscriptDayDivider(date: date)
                .padding(.top, 14)
        }
    }

    func messageRow(
        _ message: MessagePresentation,
        emphasized: Bool = false,
        marksTask: Bool = false,
        isOpenedTask: Bool = false
    ) -> ThreadMessageRow {
        ThreadMessageRow(
            message: message,
            emphasized: emphasized,
            marksTask: marksTask,
            isOpenedTask: isOpenedTask,
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
        item.message.flatMap { $0.isPending ? nil : $0 }
    }

    /// Everything a row draws from beyond its item, read in the screen's own
    /// body so a change re-hosts the visible rows: a visual's height report,
    /// an image tile's settled box, a pending own reaction, the press tint,
    /// and the parent chain's and history's load state that the accessory
    /// rows show.
    var rowRevision: Int {
        var hasher = Hasher()
        hasher.combine(visualHeights.revision)
        hasher.combine(attachmentTiles.revision)
        hasher.combine(reactionBoard?.revision)
        hasher.combine(heldMessageID)
        hasher.combine(actionMessage?.id)
        hasher.combine(history.hasOlder)
        hasher.combine(history.isLoading)
        if let inlineReplies {
            hasher.combine(inlineReplies.isLoaded())
            hasher.combine(inlineReplies.isLoading())
            hasher.combine(inlineReplies.hasOlder())
            hasher.combine(inlineReplies.hasNewer())
        }
        return hasher.finalize()
    }

    /// Whether a row shows the press tint: held now, or its drawer is open.
    func isPressed(_ message: MessagePresentation) -> Bool {
        message.id == heldMessageID || message.id == actionMessage?.id
    }
}
