import SwiftUI

extension TaskChatView {
    @ViewBuilder
    func taskRow(_ item: TaskTranscriptItem) -> some View {
        switch item {
        case .startedFrom(let origin):
            TaskStartedFromRow(origin: origin, onOpen: onOpenOrigin)
                .padding(.bottom, 8)
        case .message(let message, let grouping):
            // The Chat timeline's own row, spaced as the Chat spaces it.
            MessageTimelineRow(
                message: message,
                isContinuation: grouping.isContinuation,
                showsReplyReference: grouping.showsReplyReference,
                isHighlighted: highlightedMessageID == message.id,
                isPressed: message.id == heldMessageID || message.id == actionMessage?.id,
                attachmentPreview: $attachmentPreview,
                attachmentTiles: attachmentTiles,
                visualHeights: visualHeights,
                reactionBoard: reactionBoard,
                onOpenInlineReply: revealInlineReply,
                onOpenAttachment: onOpenAttachment,
                accessibilityActions: accessibilityActions(for: message)
            )
            .padding(.top, grouping.startsDay ? 0 : grouping.isContinuation ? 4 : 16)
        case .dayDivider(let date):
            TranscriptDayDivider(date: date)
                .padding(.top, 12)
                .padding(.bottom, 4)
        }
    }

    /// A reference's tap reveals and highlights the message it names when the
    /// Task is showing it.
    func revealInlineReply(_ reference: MessageReplyReferencePresentation) {
        guard let item = projection.items.first(where: { $0.message?.id == reference.id }) else { return }
        reveal = TranscriptReveal(token: UUID(), id: item.id, animated: true)
        highlightedMessageID = reference.id
    }

    func fadeHighlight() async {
        guard highlightedMessageID != nil else { return }
        try? await Task.sleep(for: .milliseconds(1_500))
        guard !Task.isCancelled else { return }
        withAnimation(.easeOut(duration: 0.45)) { highlightedMessageID = nil }
    }

    /// Inside a Task the drawer offers reactions and copying; VoiceOver gets
    /// the same.
    func accessibilityActions(for message: MessagePresentation) -> MessageRowAccessibilityActions {
        .forMessage(
            message,
            canReplyInline: false,
            onReact: { actionMessage = message },
            onReply: {}
        )
    }

    static func drawerMessage(for item: TaskTranscriptItem) -> MessagePresentation? {
        item.message.flatMap { $0.isPending ? nil : $0 }
    }

    /// Everything a row draws from beyond its item, read in the screen's own
    /// body so a change re-hosts the visible rows.
    var rowRevision: Int {
        var hasher = Hasher()
        hasher.combine(visualHeights.revision)
        hasher.combine(attachmentTiles.revision)
        hasher.combine(reactionBoard?.revision)
        hasher.combine(heldMessageID)
        hasher.combine(actionMessage?.id)
        hasher.combine(highlightedMessageID)
        hasher.combine(history.hasOlder)
        hasher.combine(history.isLoading)
        return hasher.finalize()
    }
}

/// The quiet first row of a Task: where it started, and the Message it
/// started from as one line when that Channel is loaded. Tapping opens the
/// origin Message in its Channel.
struct TaskStartedFromRow: View {
    let origin: TaskStartedFromPresentation
    let onOpen: () -> Void

    var body: some View {
        Button(action: onOpen) {
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Image(systemName: "arrow.turn.left.up")
                    .font(.footnote.weight(.semibold))
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 2) {
                    Text(origin.title)
                        .font(.footnote.weight(.semibold))
                        .fixedSize(horizontal: false, vertical: true)
                    if let excerpt = origin.excerpt {
                        Text(excerpt)
                            .font(.footnote)
                            .lineLimit(2)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .foregroundStyle(.secondary)
            .frame(minHeight: 44, alignment: .leading)
            .contentShape(Rectangle())
        }
        .buttonStyle(.pressableRow(cornerRadius: HausRadius.medium))
        .accessibilityElement(children: .combine)
        .accessibilityHint("Opens the message this task started from")
        .accessibilityIdentifier("task-started-from")
    }
}
