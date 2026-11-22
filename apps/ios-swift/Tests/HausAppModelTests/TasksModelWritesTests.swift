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

    @Test("Unassigning sends a null assignee at the Task's version")
    func unassignEncodesNull() throws {
        let task = AppModelFixtures.task("task_1", version: 3)

        let unassign = TasksModel.assignInput(nil, to: task, serverID: "srv_a")
        let assign = TasksModel.assignInput(.agent(agentID: "agent_1"), to: task, serverID: "srv_a")

        let unassigned = try JSONSerialization.jsonObject(with: JSONEncoder().encode(unassign)) as? [String: Any]
        let assigned = try JSONSerialization.jsonObject(with: JSONEncoder().encode(assign)) as? [String: Any]
        #expect(unassigned?["assignee"] is NSNull)
        #expect(unassigned?["expectedVersion"] as? Int == 3)
        #expect((assigned?["assignee"] as? [String: String]) == ["kind": "agent", "agentId": "agent_1"])
    }

    @Test("A write's answer lands in the detail, the open list, and the filtered list")
    func writeLandsEverywhereHeld() throws {
        let tasks = model()
        let ticket = try scope.requireTicket()
        let detailRead = try tasks.beginDetailRead(taskID: "task_1")
        tasks.landDetail(AppModelFixtures.detail("task_1"), for: detailRead)
        let openRead = try tasks.beginOpenTasksRead()
        tasks.landOpenTasks([AppModelFixtures.task("task_1"), AppModelFixtures.task("task_2")], for: openRead)
        let filter = TaskListFilter(states: [.todo, .open])
        let listRead = try tasks.beginListRead(filter)
        tasks.landList([AppModelFixtures.task("task_1")], for: listRead, filter: filter)

        let started = AppModelFixtures.task("task_1", state: "open", version: 2)
        #expect(tasks.landWrite(started, ticket: ticket))

        #expect(tasks.detailsByID["task_1"]?.task.state == .open)
        #expect(tasks.openTasks?.map(\.state) == [.open, .todo])
        #expect(tasks.list?.tasks.first?.version == 2)
    }

    @Test("A write answered after a Server switch, or older than what is held, writes nothing")
    func staleWritesAreDropped() throws {
        let tasks = model()
        let ticket = try scope.requireTicket()
        let read = try tasks.beginDetailRead(taskID: "task_1")
        tasks.landDetail(TaskDetail(task: AppModelFixtures.task("task_1", version: 5), mentions: [], reminders: []), for: read)

        #expect(tasks.landWrite(AppModelFixtures.task("task_1", state: "done", version: 4), ticket: ticket))
        #expect(tasks.detailsByID["task_1"]?.task.state == .todo)

        scope.activate("srv_b")
        #expect(!tasks.landWrite(AppModelFixtures.task("task_1", state: "done", version: 6), ticket: ticket))
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

    @Test("An empty patch is refused before it is sent")
    func emptyPatchIsRefused() async {
        let tasks = model()
        await #expect(throws: TaskWriteError.nothingToChange) {
            try await tasks.update(nil, of: AppModelFixtures.task("task_1"))
        }
    }
}
