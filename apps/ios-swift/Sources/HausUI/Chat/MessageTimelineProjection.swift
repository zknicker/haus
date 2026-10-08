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

    var id: String { message.id }
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
    private(set) var entries: [MessageTimelineEntry] = []
    private(set) var messageIDs: [String] = []
    private(set) var imagePages: [MessageAttachmentPresentation] = []

    func update(_ messages: [MessagePresentation]) {
        guard messages != self.messages else { return }
        self.messages = messages
        entries = Self.entries(for: messages)
        messageIDs = messages.map(\.id)
        imagePages = AttachmentImagePages.pages(in: messages)
    }

    nonisolated static func entries(
        for messages: [MessagePresentation],
        calendar: Calendar = .current
    ) -> [MessageTimelineEntry] {
        messages.indices.map { index in
            MessageTimelineEntry(
                message: messages[index],
                grouping: TranscriptRowGrouping(
                    messages[index],
                    after: index > 0 ? messages[index - 1] : nil,
                    calendar: calendar
                ),
                isFirst: index == 0
            )
        }
    }
}
