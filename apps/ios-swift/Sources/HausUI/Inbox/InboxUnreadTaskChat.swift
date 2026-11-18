import Foundation
import HausModels

/// One followed Task with messages waiting (ADR 0052 decision 9), as the
/// Unread section reads it: an Unread row like a Channel's, wearing its origin
/// Channel's mark. Like every Unread row it carries no count; being in the
/// section is the dot.
public struct InboxUnreadTaskChat: Identifiable, Equatable, Sendable {
    /// The Task's own Chat, which Mark read names.
    public let id: String
    public let taskID: String
    public let key: String
    public let title: String
    public let state: TaskState
    /// The origin Channel's mark, since the Channel is the place it lives.
    public let mark: InboxMark
    public let lastActivityAt: Date?
    /// The newest message waiting.
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

    /// The title alone on the first line, so a long one wraps at word
    /// boundaries instead of being cut; `SEC-12 · Open` under it; then who
    /// spoke and what they said, the way a Channel row quotes: every author
    /// is named, the viewer as `You`.
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
