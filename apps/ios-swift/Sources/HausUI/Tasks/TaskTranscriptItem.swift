import Foundation

/// One Task chat row: where the Task started, or a message in the assistant
/// layout with the centered time that leads each turn.
enum TaskTranscriptItem: Identifiable, Equatable {
    case startedFrom(TaskStartedFromPresentation)
    case message(MessageTimelineEntry)

    var id: String {
        switch self {
        case .startedFrom: "task-started-from"
        case .message(let entry): entry.id
        }
    }

    var isPending: Bool {
        message?.isPending ?? false
    }

    var message: MessagePresentation? {
        if case .message(let entry) = self { return entry.message }
        return nil
    }

    static func items(
        startedFrom: TaskStartedFromPresentation?,
        messages: [MessagePresentation],
        hasOlder: Bool,
        calendar: Calendar = .current
    ) -> [TaskTranscriptItem] {
        let lead: [TaskTranscriptItem] = startedFrom.flatMap { hasOlder ? nil : [.startedFrom($0)] } ?? []
        let entries = MessageTimelineProjection.entries(for: messages, style: .assistant, calendar: calendar)
        return lead + entries.map(TaskTranscriptItem.message)
    }
}

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
