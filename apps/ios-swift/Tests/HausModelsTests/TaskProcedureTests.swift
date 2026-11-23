import Foundation
import XCTest
@testable import HausModels

final class TaskProcedureTests: XCTestCase {
    func testEveryTaskProcedureNamesItsServerPath() {
        XCTAssertEqual(TaskProcedures.create.path, "task.create")
        XCTAssertEqual(TaskProcedures.create.kind, .mutation)
        XCTAssertEqual(TaskProcedures.setState.path, "task.setState")
        XCTAssertEqual(TaskProcedures.assign.path, "task.assign")
        XCTAssertEqual(TaskProcedures.setFollow.path, "task.setFollow")
        XCTAssertEqual(TaskProcedures.update.path, "task.update")
        XCTAssertEqual(TaskProcedures.list.path, "task.list")
        XCTAssertEqual(TaskProcedures.list.kind, .query)
        XCTAssertEqual(TaskProcedures.listOpen.path, "task.listOpen")
        XCTAssertEqual(TaskProcedures.labels.path, "taskLabel.list")
    }

    func testAMutationResultDecodesTheWholeTaskRecord() throws {
        let result = try ContractFixtures.decode(TaskMutationResult.self, #"{"task":\#(ContractFixtures.task)}"#)
        XCTAssertEqual(result.task.key, "SEC-12")
        XCTAssertEqual(result.task.projectID, "project_sec")
        XCTAssertEqual(result.task.keyID, "key_sec")
        XCTAssertEqual(result.task.number, 12)
        XCTAssertEqual(result.task.assignee, .agent(agentID: "agent_1"))
        XCTAssertEqual(result.task.dueOn, "2026-11-30")
    }

    func testListsDecodeTaskRecordsAndLabels() throws {
        let tasks = try ContractFixtures.decode([TaskRecord].self, "[\(ContractFixtures.task)]")
        XCTAssertEqual(tasks.map(\.id), ["task_12"])
        let labels = try ContractFixtures.decode([TaskLabel].self, #"[{"color":"teal","id":"label_1","name":"Server"}]"#)
        XCTAssertEqual(labels, [TaskLabel(color: "teal", id: "label_1", name: "Server")])
    }

    func testTheFollowReceiptDecodes() throws {
        let receipt = try ContractFixtures.decode(
            TaskFollowReceipt.self, #"{"followed":true,"serverId":"server_1","taskId":"task_12"}"#
        )
        XCTAssertEqual(receipt.followed, true)
        XCTAssertEqual(receipt.taskID, "task_12")
    }

    func testCreateSendsTheFiledTaskAndRefusesABlankTitle() throws {
        let input = try XCTUnwrap(TaskCreateInput(
            assigneeAgentID: "agent_1", projectID: "project_sec", serverID: "server_1", title: "Rate-limit"
        ))
        XCTAssertEqual(try ContractFixtures.encoded(input), try ContractFixtures.object(
            #"{"assigneeAgentId":"agent_1","projectId":"project_sec","serverId":"server_1","title":"Rate-limit"}"#
        ))
        XCTAssertNil(TaskCreateInput(assigneeAgentID: "a", projectID: "p", serverID: "s", title: "   "))
        XCTAssertNil(TaskCreateInput(assigneeAgentID: "a", projectID: "p", serverID: "s", title: String(repeating: "x", count: 201)))
    }

    func testSetStateAndFollowSendTheirExactShapes() throws {
        let state = TaskSetStateInput(expectedVersion: 3, serverID: "server_1", state: .done, taskID: "task_12")
        XCTAssertEqual(try ContractFixtures.encoded(state), try ContractFixtures.object(
            #"{"expectedVersion":3,"serverId":"server_1","state":"done","taskId":"task_12"}"#
        ))
        let follow = TaskSetFollowInput(followed: false, serverID: "server_1", taskID: "task_12")
        XCTAssertEqual(try ContractFixtures.encoded(follow), try ContractFixtures.object(
            #"{"followed":false,"serverId":"server_1","taskId":"task_12"}"#
        ))
    }

    func testUnassigningSendsANullAssignee() throws {
        let unassign = TaskAssignInput(assignee: nil, expectedVersion: 3, serverID: "server_1", taskID: "task_12")
        XCTAssertEqual(try ContractFixtures.encoded(unassign), try ContractFixtures.object(
            #"{"assignee":null,"expectedVersion":3,"serverId":"server_1","taskId":"task_12"}"#
        ))
        let assign = TaskAssignInput(assignee: .user(userID: "user_1"), expectedVersion: 3, serverID: "s", taskID: "t")
        XCTAssertEqual(try ContractFixtures.encoded(assign)["assignee"] as? NSDictionary, try ContractFixtures.object(
            #"{"kind":"user","userId":"user_1"}"#
        ))
    }

    func testAnUpdatePatchNamesOnlyWhatChangesAndClearsTheDueDateWithNull() throws {
        let patch = try XCTUnwrap(TaskUpdatePatch(dueOn: .clear, priority: .urgent))
        let input = TaskUpdateInput(expectedVersion: 3, patch: patch, serverID: "server_1", taskID: "task_12")
        XCTAssertEqual(try ContractFixtures.encoded(input), try ContractFixtures.object(
            #"{"expectedVersion":3,"patch":{"dueOn":null,"priority":"urgent"},"serverId":"server_1","taskId":"task_12"}"#
        ))
        XCTAssertNil(TaskUpdatePatch())
        XCTAssertNil(TaskUpdatePatch(labelIDs: ["label_1", "label_1"]))
        XCTAssertNil(TaskUpdatePatch(dueOn: .set("next week")))
        XCTAssertNotNil(TaskUpdatePatch(dueOn: .set("2026-12-01")))
    }

    func testListFiltersByAssigneeAndRefusesAnEmptyStateFilter() throws {
        let unassigned = try XCTUnwrap(TaskListInput(serverID: "server_1", assignee: .unassigned, states: [.todo, .open]))
        XCTAssertEqual(try ContractFixtures.encoded(unassigned), try ContractFixtures.object(
            #"{"assignee":"none","serverId":"server_1","states":["todo","open"]}"#
        ))
        let byAgent = try XCTUnwrap(TaskListInput(serverID: "server_1", assignee: .agent(id: "agent_1"), keyID: "key_sec"))
        XCTAssertEqual(try ContractFixtures.encoded(byAgent), try ContractFixtures.object(
            #"{"assignee":{"agentId":"agent_1"},"keyId":"key_sec","serverId":"server_1"}"#
        ))
        XCTAssertNil(TaskListInput(serverID: "server_1", states: []))
    }
}
