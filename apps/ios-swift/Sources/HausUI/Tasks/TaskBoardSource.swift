import Foundation
import HausModels

/// Someone a Task can be assigned to: an active member or a non-retired Agent.
public struct TaskAssigneeOption: Identifiable, Hashable, Sendable {
    public let actor: TaskActor
    public let name: String
    public let avatarURL: URL?

    public var id: TaskActor { actor }

    public init(actor: TaskActor, name: String, avatarURL: URL?) {
        self.actor = actor
        self.name = name
        self.avatarURL = avatarURL
    }
}

/// What the New task sheet hands back. The App layer adds the Server.
public struct TaskDraft: Equatable, Sendable {
    public let boardID: String
    public let title: String
    public let description: String
    public let columnID: String?
    public let assignee: TaskActor?
    public let priority: TaskPriority
    public let labelIDs: [String]
    public let dueOn: String?
    /// Convert to Task: the message the Server reads the description from and
    /// records as the first Mentioned in.
    public let sourceMessageID: String?

    public init(
        boardID: String,
        title: String,
        description: String,
        columnID: String?,
        assignee: TaskActor?,
        priority: TaskPriority,
        labelIDs: [String],
        dueOn: String?,
        sourceMessageID: String? = nil
    ) {
        self.boardID = boardID
        self.title = title
        self.description = description
        self.columnID = columnID
        self.assignee = assignee
        self.priority = priority
        self.labelIDs = labelIDs
        self.dueOn = dueOn
        self.sourceMessageID = sourceMessageID
    }
}

/// The narrow App-layer seam for the Tasks destination.
///
/// Reads are the Store's own snapshots, so a durable event repaints a screen
/// without anyone pulling to refresh, and each returns nil until its first read
/// lands. Loads ask for that read. Writes answer with an error for the screen
/// to state; the Store owns the optimistic move and the receipt.
public struct TaskBoardSource: Sendable {
    public let boards: @MainActor @Sendable () -> [Board]?
    public let tasks: @MainActor @Sendable (_ boardID: String) -> [BoardTask]?
    public let detail: @MainActor @Sendable (_ taskID: String) -> BoardTaskDetail?
    public let labels: @MainActor @Sendable () -> [TaskLabel]
    public let assignees: @MainActor @Sendable () -> [TaskAssigneeOption]
    public let actor: @MainActor @Sendable (TaskActor) -> MessageAuthorPresentation?
    /// Where a Chat is, as a label: `#product`, `DM`, or `Thread`.
    public let conversationLabel: @MainActor @Sendable (_ chatID: String) -> String

    public let loadBoards: @MainActor @Sendable () async throws -> Void
    public let loadTasks: @MainActor @Sendable (_ boardID: String) async throws -> Void
    public let loadDetail: @MainActor @Sendable (_ taskID: String) async throws -> Void
    public let loadLabels: @MainActor @Sendable () async throws -> Void

    public let createBoard: @MainActor @Sendable (_ key: String, _ name: String) async throws -> Board
    public let saveBoard: @MainActor @Sendable (Board, BoardUpdatePatch, BoardColumnPlan?) async throws -> Void
    public let createTask: @MainActor @Sendable (TaskDraft) async throws -> BoardTask
    public let updateTask: @MainActor @Sendable (BoardTask, TaskUpdatePatch) async throws -> Void
    public let moveTask: @MainActor @Sendable (BoardTask, _ columnID: String) async throws -> Void
    public let assignTask: @MainActor @Sendable (BoardTask, TaskActor?) async throws -> Void

    public init(
        boards: @escaping @MainActor @Sendable () -> [Board]?,
        tasks: @escaping @MainActor @Sendable (String) -> [BoardTask]?,
        detail: @escaping @MainActor @Sendable (String) -> BoardTaskDetail?,
        labels: @escaping @MainActor @Sendable () -> [TaskLabel],
        assignees: @escaping @MainActor @Sendable () -> [TaskAssigneeOption],
        actor: @escaping @MainActor @Sendable (TaskActor) -> MessageAuthorPresentation?,
        conversationLabel: @escaping @MainActor @Sendable (String) -> String,
        loadBoards: @escaping @MainActor @Sendable () async throws -> Void,
        loadTasks: @escaping @MainActor @Sendable (String) async throws -> Void,
        loadDetail: @escaping @MainActor @Sendable (String) async throws -> Void,
        loadLabels: @escaping @MainActor @Sendable () async throws -> Void,
        createBoard: @escaping @MainActor @Sendable (String, String) async throws -> Board,
        saveBoard: @escaping @MainActor @Sendable (Board, BoardUpdatePatch, BoardColumnPlan?) async throws -> Void,
        createTask: @escaping @MainActor @Sendable (TaskDraft) async throws -> BoardTask,
        updateTask: @escaping @MainActor @Sendable (BoardTask, TaskUpdatePatch) async throws -> Void,
        moveTask: @escaping @MainActor @Sendable (BoardTask, String) async throws -> Void,
        assignTask: @escaping @MainActor @Sendable (BoardTask, TaskActor?) async throws -> Void
    ) {
        self.boards = boards
        self.tasks = tasks
        self.detail = detail
        self.labels = labels
        self.assignees = assignees
        self.actor = actor
        self.conversationLabel = conversationLabel
        self.loadBoards = loadBoards
        self.loadTasks = loadTasks
        self.loadDetail = loadDetail
        self.loadLabels = loadLabels
        self.createBoard = createBoard
        self.saveBoard = saveBoard
        self.createTask = createTask
        self.updateTask = updateTask
        self.moveTask = moveTask
        self.assignTask = assignTask
    }
}

extension TaskBoardSource {
    /// Fixture data and writes that do nothing, for previews.
    static let preview = TaskBoardSource(
        boards: { TaskPreviewFixtures.boards },
        tasks: { _ in TaskPreviewFixtures.tasks },
        detail: { _ in TaskPreviewFixtures.detail },
        labels: { TaskPreviewFixtures.labels },
        assignees: { TaskPreviewFixtures.assignees },
        actor: { actor in
            TaskPreviewFixtures.assignees.first { $0.actor == actor }.map {
                MessageAuthorPresentation(id: $0.id.agentID ?? "", name: $0.name, avatarURL: nil)
            }
        },
        conversationLabel: { _ in "#security" },
        loadBoards: {},
        loadTasks: { _ in },
        loadDetail: { _ in },
        loadLabels: {},
        createBoard: { _, _ in TaskPreviewFixtures.boards[0] },
        saveBoard: { _, _, _ in },
        createTask: { _ in TaskPreviewFixtures.tasks[0] },
        updateTask: { _, _ in },
        moveTask: { _, _ in },
        assignTask: { _, _ in }
    )
}
