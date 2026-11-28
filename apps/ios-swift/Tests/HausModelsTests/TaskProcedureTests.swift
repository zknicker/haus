import Foundation
import XCTest
@testable import HausModels

final class TaskProcedureTests: XCTestCase {
    func testEveryTaskProcedureNamesItsServerPath() {
        XCTAssertEqual(TaskProcedures.start.path, "task.start")
        XCTAssertEqual(TaskProcedures.start.kind, .mutation)
        XCTAssertEqual(TaskProcedures.archive.path, "task.archive")
        XCTAssertEqual(TaskProcedures.unarchive.path, "task.unarchive")
        XCTAssertEqual(TaskProcedures.setFollow.path, "task.setFollow")
        XCTAssertEqual(TaskProcedures.update.path, "task.update")
        XCTAssertEqual(TaskProcedures.get.path, "task.get")
        XCTAssertEqual(TaskProcedures.list.path, "task.list")
        XCTAssertEqual(TaskProcedures.list.kind, .query)
        XCTAssertEqual(TaskProcedures.listActive.path, "task.listActive")
    }

    func testAMutationResultDecodesTheWholeTaskRecord() throws {
        let result = try ContractFixtures.decode(TaskMutationResult.self, #"{"task":\#(ContractFixtures.task)}"#)
        XCTAssertEqual(result.task.shortID, "k3mq7xta")
        XCTAssertEqual(result.task.projectID, "project_sec")
        XCTAssertEqual(result.task.captainID, "agent_1")
        XCTAssertEqual(result.task.computerID, "cmp_1")
        XCTAssertEqual(result.task.model, "gpt-5.5")
        XCTAssertEqual(result.task.status, .working)
        XCTAssertFalse(result.task.isArchived)
    }

    func testListsDecodeTaskRecords() throws {
        let tasks = try ContractFixtures.decode([TaskRecord].self, "[\(ContractFixtures.task)]")
        XCTAssertEqual(tasks.map(\.id), ["task_12"])
    }

    func testTheFollowReceiptDecodes() throws {
        let receipt = try ContractFixtures.decode(
            TaskFollowReceipt.self, #"{"followed":true,"serverId":"server_1","taskId":"task_12"}"#
        )
        XCTAssertEqual(receipt.followed, true)
        XCTAssertEqual(receipt.taskID, "task_12")
    }

    func testStartSendsThePromptAndRefusesABlankOne() throws {
        let input = try XCTUnwrap(TaskStartInput(
            computerID: "cmp_1", model: "gpt-5.5", projectID: "project_sec", prompt: " Rate-limit\n",
            requestID: "req_1", serverID: "server_1"
        ))
        XCTAssertEqual(try ContractFixtures.encoded(input), try ContractFixtures.object(
            #"{"computerId":"cmp_1","model":"gpt-5.5","projectId":"project_sec","prompt":"Rate-limit","requestId":"req_1","serverId":"server_1"}"#
        ))
        XCTAssertNil(TaskStartInput(model: "m", projectID: "p", prompt: "   ", requestID: "r", serverID: "s"))
        XCTAssertNil(TaskStartInput(
            model: "m", projectID: "p", prompt: String(repeating: "x", count: 20_001), requestID: "r", serverID: "s"
        ))
    }

    func testArchiveAndFollowSendTheirExactShapes() throws {
        let archive = TaskArchiveInput(expectedVersion: 3, serverID: "server_1", taskID: "task_12")
        XCTAssertEqual(try ContractFixtures.encoded(archive), try ContractFixtures.object(
            #"{"expectedVersion":3,"serverId":"server_1","taskId":"task_12"}"#
        ))
        let follow = TaskSetFollowInput(followed: false, serverID: "server_1", taskID: "task_12")
        XCTAssertEqual(try ContractFixtures.encoded(follow), try ContractFixtures.object(
            #"{"followed":false,"serverId":"server_1","taskId":"task_12"}"#
        ))
    }

    func testRenameSendsATrimmedTitleAndRefusesABlankOne() throws {
        let input = try XCTUnwrap(TaskUpdateInput(title: " Throttle ", expectedVersion: 3, serverID: "server_1", taskID: "task_12"))
        XCTAssertEqual(try ContractFixtures.encoded(input), try ContractFixtures.object(
            #"{"expectedVersion":3,"patch":{"title":"Throttle"},"serverId":"server_1","taskId":"task_12"}"#
        ))
        XCTAssertNil(TaskUpdateInput(title: "  ", expectedVersion: 3, serverID: "s", taskID: "t"))
        XCTAssertNil(TaskUpdateInput(title: String(repeating: "x", count: 201), expectedVersion: 3, serverID: "s", taskID: "t"))
    }

    func testTheListAsksForActiveOrArchivedTasks() throws {
        XCTAssertEqual(try ContractFixtures.encoded(TaskListInput(serverID: "server_1")), try ContractFixtures.object(
            #"{"archived":false,"serverId":"server_1"}"#
        ))
        XCTAssertEqual(
            try ContractFixtures.encoded(TaskListInput(serverID: "server_1", archived: true)),
            try ContractFixtures.object(#"{"archived":true,"serverId":"server_1"}"#)
        )
    }
}
