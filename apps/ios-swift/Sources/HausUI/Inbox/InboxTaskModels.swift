import Foundation
import HausModels

/// The message an item stands on: the newest one referencing the Task that the
/// reader can read. Its author and place are resolved by the App layer.
public struct InboxTaskContext: Hashable, Sendable {
    public let authorName: String
    public let authorAvatarURL: URL?
    /// `#security`, `DM`, or `Thread`.
    public let place: String
    public let createdAt: Date
    /// Raw Markdown; the row flattens it the way every quoting surface does.
    public let content: String
    /// False in an archived Chat or a retired Agent's DM, where a Thread stays
    /// readable and takes no replies, so the item offers no composer.
    public let acceptsReplies: Bool

    public init(
        authorName: String,
        authorAvatarURL: URL?,
        place: String,
        createdAt: Date,
        content: String,
        acceptsReplies: Bool = true
    ) {
        self.authorName = authorName
        self.authorAvatarURL = authorAvatarURL
        self.place = place
        self.createdAt = createdAt
        self.content = content
        self.acceptsReplies = acceptsReplies
    }
}

/// One Task assigned to the reader, as the Unread section reads it: one item
/// per Task, never bundled, because the Inbox is worked one item at a time.
public struct InboxTaskItem: Identifiable, Hashable, Sendable {
    /// The Task.
    public let id: String
    public let key: String
    public let title: String
    public let boardName: String
    public let assignerName: String
    public let assignerAvatarURL: URL?
    public let assignedAt: Date
    public let priority: TaskPriority
    public let dueOn: String?
    public let columnID: String
    public let category: ColumnCategory
    /// The board's columns, empty until `board.list` lands: the status menu and
    /// the one-tap resolutions wait for them rather than guess.
    public let columns: [BoardColumn]
    public let context: InboxTaskContext?

    public init(
        id: String,
        key: String,
        title: String,
        boardName: String,
        assignerName: String,
        assignerAvatarURL: URL?,
        assignedAt: Date,
        priority: TaskPriority,
        dueOn: String?,
        columnID: String,
        category: ColumnCategory,
        columns: [BoardColumn],
        context: InboxTaskContext?
    ) {
        self.id = id
        self.key = key
        self.title = title
        self.boardName = boardName
        self.assignerName = assignerName
        self.assignerAvatarURL = assignerAvatarURL
        self.assignedAt = assignedAt
        self.priority = priority
        self.dueOn = dueOn
        self.columnID = columnID
        self.category = category
        self.columns = columns
        self.context = context
    }

    /// The name the column carries now; the wire's category when the board has
    /// not landed yet.
    public var columnName: String {
        columns.first { $0.id == columnID }?.name ?? category.displayName
    }

    /// Where Start, Done, or Won't do lands: the board's first column of that
    /// category. Nil when the board has none, so that button is not offered.
    public func column(for resolution: TaskInboxResolution) -> BoardColumn? {
        columns.first { $0.category == resolution.category }
    }

    /// The one-tap resolutions that would move the Task somewhere new.
    public var resolutions: [(resolution: TaskInboxResolution, column: BoardColumn)] {
        TaskInboxResolution.allCases.compactMap { resolution in
            guard let column = column(for: resolution), column.id != columnID else { return nil }
            return (resolution, column)
        }
    }

    var row: InboxUnreadRow {
        InboxUnreadRow(
            id: "task:\(id)",
            mark: .identity(name: assignerName, avatarURL: assignerAvatarURL, presence: nil),
            title: key,
            preview: title,
            lastActivityAt: assignedAt,
            open: .task(taskID: id),
            kind: .task(self)
        )
    }
}

/// What a resolved or cleared item left behind for Undo.
public struct InboxTaskUndo: Hashable, Sendable {
    public let taskID: String
    /// The moved Task, carrying the version an Undo moves back from. Nil for
    /// Mark read, which moved nothing.
    public let moved: BoardTask?
    public let previousColumnID: String?

    public init(taskID: String, moved: BoardTask? = nil, previousColumnID: String? = nil) {
        self.taskID = taskID
        self.moved = moved
        self.previousColumnID = previousColumnID
    }
}

/// The line the Inbox states after acting on an item.
public struct InboxTaskNotice: Identifiable, Hashable, Sendable {
    public let id = UUID()
    public let message: String
    /// Nil for a failure, which has nothing to take back.
    public let undo: InboxTaskUndo?

    public init(message: String, undo: InboxTaskUndo? = nil) {
        self.message = message
        self.undo = undo
    }
}

/// What the Inbox can do to a Task item. Each write answers with the line to
/// state; the Store takes the item off the page at once, so a row never waits.
public struct InboxTaskActions: Sendable {
    public let move: @MainActor @Sendable (_ item: InboxTaskItem, _ column: BoardColumn) async -> InboxTaskNotice
    public let markRead: @MainActor @Sendable (_ item: InboxTaskItem) async -> InboxTaskNotice
    public let undo: @MainActor @Sendable (InboxTaskUndo) async -> InboxTaskNotice?
    /// False when nothing left, so the composer keeps what was typed.
    public let reply: @MainActor @Sendable (_ item: InboxTaskItem, _ content: String) async -> Bool

    public init(
        move: @escaping @MainActor @Sendable (InboxTaskItem, BoardColumn) async -> InboxTaskNotice,
        markRead: @escaping @MainActor @Sendable (InboxTaskItem) async -> InboxTaskNotice,
        undo: @escaping @MainActor @Sendable (InboxTaskUndo) async -> InboxTaskNotice?,
        reply: @escaping @MainActor @Sendable (InboxTaskItem, String) async -> Bool
    ) {
        self.move = move
        self.markRead = markRead
        self.undo = undo
        self.reply = reply
    }
}
