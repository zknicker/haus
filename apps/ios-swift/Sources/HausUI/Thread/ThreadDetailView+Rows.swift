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
        case .taskMetadata, .inlineReplies, .threadHeader, .dayDivider:
            nil
        }
    }

    /// Everything a row draws from beyond its item, read in the screen's own
    /// body so a change re-hosts the visible rows: a visual's height report,
    /// a pending own reaction, the press tint, and the parent chain's and
    /// history's load state that the region and accessory rows show.
    var rowRevision: Int {
        var hasher = Hasher()
        hasher.combine(visualHeights.revision)
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
