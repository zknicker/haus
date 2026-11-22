import HausModels
import Testing
@testable import HausAppModel

@MainActor
@Suite("Tasks model")
struct TasksModelTests {
    private let scope = ServerScope(serverID: "srv_a")

    private func model() -> TasksModel {
        TasksModel(client: AppModelFixtures.client, scope: scope)
    }

    @Test("The newest detail read wins, whichever lands first")
    func newestDetailWins() throws {
        let tasks = model()
        let older = try tasks.beginDetailRead(taskID: "task_1")
        let newer = try tasks.beginDetailRead(taskID: "task_1")

        #expect(tasks.landDetail(AppModelFixtures.detail("task_1", key: "SEC-2"), for: newer))
        #expect(!tasks.landDetail(AppModelFixtures.detail("task_1", key: "SEC-1"), for: older))
        #expect(tasks.detailsByID["task_1"]?.task.key == "SEC-2")
    }

    @Test("A detail read that began before a Server switch writes nothing")
    func lateDetailIsDropped() throws {
        let tasks = model()
        let read = try tasks.beginDetailRead(taskID: "task_1")
        scope.activate("srv_b")

        #expect(!tasks.landDetail(AppModelFixtures.detail("task_1"), for: read))
        #expect(tasks.detailsByID.isEmpty)
    }

    @Test("Open tasks stay unknown until read, then hold what landed")
    func openTasksLand() throws {
        let tasks = model()
        #expect(tasks.openTasks == nil)

        let read = try tasks.beginOpenTasksRead()
        tasks.landOpenTasks([AppModelFixtures.task("task_1")], for: read)

        #expect(tasks.openTasks?.map(\.id) == ["task_1"])
    }

    @Test("A filtered list remembers its filter, and an older filter's answer is dropped")
    func listKeepsNewestFilter() throws {
        let tasks = model()
        let todo = TaskListFilter(states: [.todo])
        let done = TaskListFilter(states: [.done])
        let first = try tasks.beginListRead(todo)
        let second = try tasks.beginListRead(done)

        #expect(tasks.landList([AppModelFixtures.task("task_2", state: "done")], for: second, filter: done))
        #expect(!tasks.landList([AppModelFixtures.task("task_1")], for: first, filter: todo))
        #expect(tasks.list?.filter == done)
        #expect(tasks.listFilter == done)
    }

    @Test("A filter with no states has no Server input")
    func emptyStatesHaveNoInput() {
        #expect(TaskListFilter(states: []).input(serverID: "srv_a") == nil)
        #expect(TaskListFilter(assignee: .unassigned).input(serverID: "srv_a")?.serverID == "srv_a")
    }

    @Test("Unread Task chats answer lookups by Task and by Chat")
    func unreadLookups() throws {
        let tasks = model()
        let read = try tasks.beginDetailRead(taskID: "task_1")
        tasks.landDetail(AppModelFixtures.detail("task_1"), for: read)

        #expect(tasks.chatID(taskID: "task_1") == "chat_task_1")
        #expect(tasks.taskID(chatID: "chat_task_1") == "task_1")
        #expect(!tasks.isUnreadTaskChat("chat_task_1"))
    }

    @Test("Reset forgets every snapshot, so nothing reads as empty")
    func resetForgets() throws {
        let tasks = model()
        let read = try tasks.beginOpenTasksRead()
        tasks.landOpenTasks([], for: read)
        tasks.reset()

        #expect(tasks.openTasks == nil)
        #expect(tasks.list == nil)
        #expect(tasks.labels == nil)
        #expect(!tasks.landOpenTasks([], for: read))
    }
}
