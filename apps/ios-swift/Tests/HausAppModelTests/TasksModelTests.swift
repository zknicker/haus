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

        #expect(tasks.landDetail(AppModelFixtures.detail("task_1", title: "Second"), for: newer))
        #expect(!tasks.landDetail(AppModelFixtures.detail("task_1", title: "First"), for: older))
        #expect(tasks.detailsByID["task_1"]?.task.title == "Second")
    }

    @Test("A detail read that began before a Server switch writes nothing")
    func lateDetailIsDropped() throws {
        let tasks = model()
        let read = try tasks.beginDetailRead(taskID: "task_1")
        scope.activate("srv_b")

        #expect(!tasks.landDetail(AppModelFixtures.detail("task_1"), for: read))
        #expect(tasks.detailsByID.isEmpty)
    }

    @Test("Active Tasks stay unknown until read, then hold what landed")
    func activeTasksLand() throws {
        let tasks = model()
        #expect(tasks.activeTasks == nil)

        let read = try tasks.beginActiveTasksRead()
        tasks.landActiveTasks([AppModelFixtures.task("task_1")], for: read)

        #expect(tasks.activeTasks?.map(\.id) == ["task_1"])
    }

    @Test("The list remembers whether it is archived, and an older list's answer is dropped")
    func listKeepsNewestView() throws {
        let tasks = model()
        let active = try tasks.beginListRead(archived: false)
        let archived = try tasks.beginListRead(archived: true)

        #expect(tasks.landList([AppModelFixtures.task("task_2", archived: true)], for: archived, archived: true))
        #expect(!tasks.landList([AppModelFixtures.task("task_1")], for: active, archived: false))
        #expect(tasks.list?.archived == true)
        #expect(tasks.listArchived == true)
    }

    @Test("Held Tasks answer lookups by Task and by Chat, the newest version first")
    func lookups() throws {
        let tasks = model()
        let read = try tasks.beginActiveTasksRead()
        tasks.landActiveTasks([AppModelFixtures.task("task_1", title: "Old", version: 1)], for: read)
        let detail = try tasks.beginDetailRead(taskID: "task_1")
        tasks.landDetail(TaskDetail(task: AppModelFixtures.task("task_1", title: "New", version: 2)), for: detail)

        #expect(tasks.chatID(taskID: "task_1") == "chat_task_1")
        #expect(tasks.taskID(chatID: "chat_task_1") == "task_1")
        #expect(tasks.heldRecords.map(\.title) == ["New"])
        #expect(!tasks.isUnreadTaskChat("chat_task_1"))
    }

    @Test("Reset forgets every snapshot, so nothing reads as empty")
    func resetForgets() throws {
        let tasks = model()
        let read = try tasks.beginActiveTasksRead()
        tasks.landActiveTasks([], for: read)
        tasks.reset()

        #expect(tasks.activeTasks == nil)
        #expect(tasks.list == nil)
        #expect(tasks.listArchived == nil)
        #expect(!tasks.landActiveTasks([], for: read))
    }
}
