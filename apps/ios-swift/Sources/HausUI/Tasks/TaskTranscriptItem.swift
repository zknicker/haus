import Foundation

/// One row of a Task's transcript: a Task is a Channel for one piece of work
/// (ADR 0053), so its rows are the Chat timeline's own, under one quiet row
/// that points back at the Message the Task started from.
enum TaskTranscriptItem: Identifiable, Equatable {
    case startedFrom(TaskStartedFromPresentation)
    case message(MessagePresentation, grouping: TranscriptRowGrouping)
    /// Opens a calendar day.
    case dayDivider(Date)

    var id: String {
        switch self {
        case .startedFrom: "task-started-from"
        case .message(let message, _): message.id
        case .dayDivider(let date): "task-day-\(Int(date.timeIntervalSinceReferenceDate))"
        }
    }

    var isPending: Bool {
        if case .message(let message, _) = self { return message.isPending }
        return false
    }

    var message: MessagePresentation? {
        if case .message(let message, _) = self { return message }
        return nil
    }

    /// The transcript in order. The "Started from" row heads it only once the
    /// oldest message is loaded, so paging back never slides it under newer
    /// history; a Task with no messages yet shows it alone. A day divider opens
    /// each calendar day, as in the Chat.
    static func items(
        startedFrom: TaskStartedFromPresentation?,
        messages: [MessagePresentation],
        hasOlder: Bool,
        calendar: Calendar = .current
    ) -> [TaskTranscriptItem] {
        var items: [TaskTranscriptItem] = []
        if let startedFrom, !hasOlder {
            items.append(.startedFrom(startedFrom))
        }
        var previous: MessagePresentation?
        for message in messages {
            let grouping = TranscriptRowGrouping(message, after: previous, calendar: calendar)
            if grouping.startsDay {
                items.append(.dayDivider(calendar.startOfDay(for: message.createdAt)))
            }
            items.append(.message(message, grouping: grouping))
            previous = message
        }
        return items
    }
}

/// The Task transcript's items, rebuilt only when an input changes: the body
/// runs on every keyboard inset step with the same arrays. A cache, not state.
@MainActor
final class TaskTranscriptProjection {
    private struct Inputs: Equatable {
        let startedFrom: TaskStartedFromPresentation?
        let messages: [MessagePresentation]
        let hasOlder: Bool
    }

    private var inputs: Inputs?
    private(set) var items: [TaskTranscriptItem] = []
    private(set) var messageIDs: [String] = []
    private(set) var imagePages: [MessageAttachmentPresentation] = []

    func update(startedFrom: TaskStartedFromPresentation?, messages: [MessagePresentation], hasOlder: Bool) {
        let next = Inputs(startedFrom: startedFrom, messages: messages, hasOlder: hasOlder)
        guard next != inputs else { return }
        inputs = next
        items = TaskTranscriptItem.items(startedFrom: startedFrom, messages: messages, hasOlder: hasOlder)
        messageIDs = messages.map(\.id)
        imagePages = AttachmentImagePages.pages(in: messages)
    }
}
