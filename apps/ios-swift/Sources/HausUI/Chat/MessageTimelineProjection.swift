import Foundation

/// One Chat transcript row: the message, and how it joins the row above it.
///
/// The grouping lives in the row's item rather than being looked up while the
/// row draws, so the transcript can tell exactly which rows changed: a message
/// whose neighbour arrived or left re-hosts because its own entry changed.
struct MessageTimelineEntry: Identifiable, Equatable {
    let message: MessagePresentation
    let grouping: TranscriptRowGrouping
    let isFirst: Bool
    /// The last row before another speaker or the end, where a Captain's
    /// reply offers its copy button.
    var endsRun = true
    /// Part of the entry so a style change re-hosts every row it reaches.
    var style = TranscriptStyle.roster

    var id: String { message.id }

    /// The air above the row's message, under any divider that leads it. A
    /// divider carries its own.
    var topSpacing: CGFloat {
        guard !isFirst, grouping.divider == nil else { return 0 }
        switch style {
        case .roster: return grouping.isContinuation ? 4 : 16
        case .assistant: return grouping.isContinuation ? 12 : 18
        }
    }
}

/// The per-page work the timeline needs, done once per page rather than once
/// per body.
///
/// The timeline's body runs on every frame of a drawer pan and every keyboard
/// inset step, with the same message array each time — the Store memoizes it —
/// so the comparison below is a storage-identity check and everything else is
/// a cached read. A screen owns one in `@State`; it is a cache, not state, so
/// filling it never invalidates the view.
@MainActor
final class MessageTimelineProjection {
    private(set) var messages: [MessagePresentation] = []
    private(set) var style = TranscriptStyle.roster
    private(set) var entries: [MessageTimelineEntry] = []
    private(set) var messageIDs: [String] = []
    private(set) var imagePages: [MessageAttachmentPresentation] = []

    func update(_ messages: [MessagePresentation], style: TranscriptStyle = .roster) {
        guard messages != self.messages || style != self.style else { return }
        if messages != self.messages {
            messageIDs = messages.map(\.id)
            imagePages = AttachmentImagePages.pages(in: messages)
        }
        self.messages = messages
        self.style = style
        entries = Self.entries(for: messages, style: style)
    }

    nonisolated static func entries(
        for messages: [MessagePresentation],
        style: TranscriptStyle = .roster,
        calendar: Calendar = .current
    ) -> [MessageTimelineEntry] {
        messages.indices.map { index in
            MessageTimelineEntry(
                message: messages[index],
                grouping: TranscriptRowGrouping(
                    messages[index],
                    after: index > 0 ? messages[index - 1] : nil,
                    style: style,
                    calendar: calendar
                ),
                isFirst: index == 0,
                endsRun: index + 1 == messages.count
                    || TranscriptSpeaker(messages[index + 1]) != TranscriptSpeaker(messages[index]),
                style: style
            )
        }
    }
}
