import Foundation
import HausModels

public struct InboxUnreadTaskChat: Identifiable, Equatable, Sendable {
    public let id: String
    public let taskID: String
    public let key: String
    public let title: String
    public let state: TaskState
    public let mark: InboxMark
    public let lastActivityAt: Date?
    public let latestMessage: ChatLastMessage?

    public init(
        id: String,
        taskID: String,
        key: String,
        title: String,
        state: TaskState,
        mark: InboxMark,
        lastActivityAt: Date?,
        latestMessage: ChatLastMessage?
    ) {
        self.id = id
        self.taskID = taskID
        self.key = key
        self.title = title
        self.state = state
        self.mark = mark
        self.lastActivityAt = lastActivityAt
        self.latestMessage = latestMessage
    }

    func row(viewerDisplayName: String?) -> InboxUnreadRow {
        InboxUnreadRow(
            id: id,
            mark: mark,
            title: title,
            facts: "\(key) · \(TaskStateLabel.text(state))",
            preview: InboxUnreadRows.previewLine(
                latestMessage,
                peerDisplayName: nil,
                viewerDisplayName: viewerDisplayName
            ) ?? InboxUnreadRows.noActivityPreview,
            lastActivityAt: lastActivityAt,
            open: .task(taskID: taskID)
        )
    }
}
