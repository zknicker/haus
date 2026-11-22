import Foundation
import HausModels
import HausTransport
import Observation
import OSLog

/// The Task snapshots: details, labels, unread Task chats, the open Tasks,
/// and one filtered list. Every snapshot stays absent until its first read,
/// so "nothing here" is never confused with "not yet known", and a task event
/// refreshes only what this client holds.
@MainActor
@Observable
public final class TasksModel {
    public internal(set) var detailsByID: [String: TaskDetail] = [:]
    public internal(set) var labels: [TaskLabel]?
    public internal(set) var unreadTasks: [ChatUnreadPreview]?
    /// `task.listOpen`, the Home tab's Open tasks.
    public internal(set) var openTasks: [TaskRecord]?
    /// The Tasks tab's filtered `task.list`, with the filter it answers.
    public internal(set) var list: TaskListSnapshot?

    @ObservationIgnored let client: TRPCClient
    @ObservationIgnored let scope: ServerScope
    @ObservationIgnored var detailReads = ReadSequence<String>()
    @ObservationIgnored var labelReads = ReadSequence<WholeList>()
    @ObservationIgnored var unreadReads = ReadSequence<WholeList>()
    @ObservationIgnored var openReads = ReadSequence<WholeList>()
    @ObservationIgnored var listReads = ReadSequence<WholeList>()
    /// The filter the next list refresh asks for: the last one shown.
    @ObservationIgnored public internal(set) var listFilter: TaskListFilter?

    public init(client: TRPCClient, scope: ServerScope) {
        self.client = client
        self.scope = scope
    }

    public func reset() {
        detailsByID = [:]
        labels = nil
        unreadTasks = nil
        openTasks = nil
        list = nil
        listFilter = nil
        detailReads.reset()
        labelReads.reset()
        unreadReads.reset()
        openReads.reset()
        listReads.reset()
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

    // MARK: - Labels

    public func reloadLabels() async throws {
        let read = try labelReads.begin(.all, in: scope)
        let loaded = try await client.call(TaskProcedures.labels, ServerScopeInput(serverID: read.serverID))
        guard scope.accepts(read, in: labelReads) else { return }
        if labels != loaded { labels = loaded }
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

    public func chatID(taskID: String) -> String? {
        detailsByID[taskID]?.task.chatID
            ?? unreadTasks?.first { $0.task?.taskID == taskID }?.chatID
    }

    public func taskID(chatID: String) -> String? {
        detailsByID.values.first { $0.task.chatID == chatID }?.task.id
            ?? unreadTasks?.first { $0.chatID == chatID }?.task?.taskID
    }

    static let logger = Logger(subsystem: "chat.haus.ios", category: "tasks")
}
