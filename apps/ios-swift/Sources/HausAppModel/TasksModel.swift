import Foundation
import HausModels
import HausTransport
import Observation
import OSLog

/// The Task snapshots: details, unread Task chats, the active Tasks, and the
/// Tasks tab's list. Every snapshot stays absent until its first read, so
/// "nothing here" is never confused with "not yet known", and a task event
/// refreshes only what this client holds.
@MainActor
@Observable
public final class TasksModel {
    public internal(set) var detailsByID: [String: TaskDetail] = [:]
    public internal(set) var unreadTasks: [ChatUnreadPreview]?
    /// `task.listActive`, the Home tab's active Tasks.
    public internal(set) var activeTasks: [TaskRecord]?
    /// The Tasks tab's `task.list`: the active Tasks or the archived ones.
    public internal(set) var list: TaskListSnapshot?
    /// `project.list`: the Projects a new Task can start in, and the names
    /// Task rows show.
    public internal(set) var projects: [Project]?

    @ObservationIgnored let client: TRPCClient
    @ObservationIgnored let scope: ServerScope
    @ObservationIgnored var detailReads = ReadSequence<String>()
    @ObservationIgnored var unreadReads = ReadSequence<WholeList>()
    @ObservationIgnored var activeReads = ReadSequence<WholeList>()
    @ObservationIgnored var listReads = ReadSequence<WholeList>()
    @ObservationIgnored var projectReads = ReadSequence<WholeList>()
    /// Whether the next list refresh asks for archived Tasks: the last list shown.
    @ObservationIgnored public internal(set) var listArchived: Bool?

    public init(client: TRPCClient, scope: ServerScope) {
        self.client = client
        self.scope = scope
    }

    public func reset() {
        detailsByID = [:]
        unreadTasks = nil
        activeTasks = nil
        list = nil
        projects = nil
        listArchived = nil
        detailReads.reset()
        unreadReads.reset()
        activeReads.reset()
        listReads.reset()
        projectReads.reset()
    }

    // MARK: - Details

    public func reloadDetail(taskID: String) async throws {
        let read = try beginDetailRead(taskID: taskID)
        let detail = try await client.call(TaskProcedures.get, TaskGetInput(serverID: read.serverID, taskID: taskID))
        landDetail(detail, for: read)
    }

    public func beginDetailRead(taskID: String) throws -> ScopedRead<String> {
        try detailReads.begin(taskID, in: scope)
    }

    @discardableResult
    public func landDetail(_ detail: TaskDetail, for read: ScopedRead<String>) -> Bool {
        guard scope.accepts(read, in: detailReads) else { return false }
        if detailsByID[read.key] != detail { detailsByID[read.key] = detail }
        return true
    }

    // MARK: - Unread Task chats

    public func reloadUnreadTasks() async throws {
        let read = try beginUnreadRead()
        let loaded: ChatUnreadPreviewList = try await client.query(
            "chat.unreadPreviews",
            input: ServerScopeInput(serverID: read.serverID)
        )
        landUnreadTasks(loaded.taskPreviews, for: read)
    }

    public func beginUnreadRead() throws -> ScopedRead<WholeList> {
        try unreadReads.begin(.all, in: scope)
    }

    @discardableResult
    public func landUnreadTasks(_ tasks: [ChatUnreadPreview], for read: ScopedRead<WholeList>) -> Bool {
        guard scope.accepts(read, in: unreadReads, reconciling: .unreadTasks) else { return false }
        if unreadTasks != tasks { unreadTasks = tasks }
        return true
    }

    public func isUnreadTaskChat(_ chatID: String) -> Bool {
        unreadTasks?.contains { $0.chatID == chatID } == true
    }

    // MARK: - Lookups

    /// Every Task record this client holds, newest version first per id.
    public var heldRecords: [TaskRecord] {
        var byID: [String: TaskRecord] = [:]
        let records = detailsByID.values.map(\.task) + (activeTasks ?? []) + (list?.tasks ?? [])
        for record in records where (byID[record.id]?.version ?? 0) < record.version {
            byID[record.id] = record
        }
        return Array(byID.values)
    }

    public func record(taskID: String) -> TaskRecord? {
        detailsByID[taskID]?.task
            ?? activeTasks?.first { $0.id == taskID }
            ?? list?.tasks.first { $0.id == taskID }
    }

    public func chatID(taskID: String) -> String? {
        record(taskID: taskID)?.chatID
            ?? unreadTasks?.first { $0.task?.taskID == taskID }?.chatID
    }

    public func taskID(chatID: String) -> String? {
        heldRecords.first { $0.chatID == chatID }?.id
            ?? unreadTasks?.first { $0.chatID == chatID }?.task?.taskID
    }

    static let logger = Logger(subsystem: "chat.haus.ios", category: "tasks")
}
