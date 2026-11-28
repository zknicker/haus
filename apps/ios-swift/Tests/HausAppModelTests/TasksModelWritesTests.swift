import Foundation
import HausModels
import Testing
@testable import HausAppModel

@MainActor
@Suite("Tasks model writes")
struct TasksModelWritesTests {
    private let scope = ServerScope(serverID: "srv_a")

    private func model() -> TasksModel {
        TasksModel(client: AppModelFixtures.client, scope: scope)
    }

    @Test("A write's answer lands in the detail, the active list, and the Tasks list")
    func writeLandsEverywhereHeld() throws {
        let tasks = model()
        let ticket = try scope.requireTicket()
        let detailRead = try tasks.beginDetailRead(taskID: "task_1")
        tasks.landDetail(AppModelFixtures.detail("task_1"), for: detailRead)
        let activeRead = try tasks.beginActiveTasksRead()
        tasks.landActiveTasks([AppModelFixtures.task("task_1"), AppModelFixtures.task("task_2")], for: activeRead)
        let listRead = try tasks.beginListRead(archived: false)
        tasks.landList([AppModelFixtures.task("task_1")], for: listRead, archived: false)

        let archived = AppModelFixtures.task("task_1", archived: true, version: 2)
        #expect(tasks.landWrite(archived, ticket: ticket))

        #expect(tasks.detailsByID["task_1"]?.task.isArchived == true)
        #expect(tasks.activeTasks?.map(\.isArchived) == [true, false])
        #expect(tasks.list?.tasks.first?.version == 2)
    }

    @Test("A write answered after a Server switch, or older than what is held, writes nothing")
    func staleWritesAreDropped() throws {
        let tasks = model()
        let ticket = try scope.requireTicket()
        let read = try tasks.beginDetailRead(taskID: "task_1")
        tasks.landDetail(TaskDetail(task: AppModelFixtures.task("task_1", version: 5)), for: read)

        #expect(tasks.landWrite(AppModelFixtures.task("task_1", archived: true, version: 4), ticket: ticket))
        #expect(tasks.detailsByID["task_1"]?.task.isArchived == false)

        scope.activate("srv_b")
        #expect(!tasks.landWrite(AppModelFixtures.task("task_1", archived: true, version: 6), ticket: ticket))
        #expect(!tasks.landFollow(true, taskID: "task_1", ticket: ticket))
    }

    @Test("Following lands on the held detail")
    func followLands() throws {
        let tasks = model()
        let ticket = try scope.requireTicket()
        let read = try tasks.beginDetailRead(taskID: "task_1")
        tasks.landDetail(AppModelFixtures.detail("task_1"), for: read)

        tasks.landFollow(true, taskID: "task_1", ticket: ticket)

        #expect(tasks.detailsByID["task_1"]?.followed == true)
    }

    @Test("Projects stay unknown until read, and reset forgets them")
    func projectsLand() throws {
        let tasks = model()
        #expect(tasks.projects == nil)

        let read = try tasks.beginProjectsRead()
        #expect(tasks.landProjects([AppModelFixtures.project("project_1")], for: read))
        #expect(tasks.projects?.map(\.name) == ["product"])

        tasks.reset()
        #expect(tasks.projects == nil)
        #expect(!tasks.landProjects([], for: read))
    }

    @Test("A blank title is refused before it is sent")
    func blankTitleIsRefused() async {
        let tasks = model()
        await #expect(throws: TaskWriteError.invalidTitle) {
            try await tasks.rename(AppModelFixtures.task("task_1"), to: "   ")
        }
    }
}
