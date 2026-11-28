import Foundation
import XCTest
@testable import HausModels

final class ProjectContractTests: XCTestCase {
    private let project = """
    {"archived":false,"chatId":"chat_sec","defaultMachine":{"computerId":"cmp_1","computerName":"Studio"},
     "homeAgentIds":["agent_1"],"isHaus":false,"key":"SEC","keyEditable":true,"name":"sec",
     "serverId":"server_1","taskKeyId":"key_sec"}
    """

    func testEveryProjectProcedureNamesItsServerPath() {
        XCTAssertEqual(ProjectProcedures.list.path, "project.list")
        XCTAssertEqual(ProjectProcedures.list.kind, .query)
        XCTAssertEqual(ProjectProcedures.create.path, "project.create")
        XCTAssertEqual(ProjectProcedures.update.path, "project.update")
        XCTAssertEqual(ProjectProcedures.setDefaultMachine.path, "project.setDefaultMachine")
        XCTAssertEqual(ProjectProcedures.setDefaultMachine.kind, .mutation)
    }

    func testAProjectDecodesItsDefaultMachine() throws {
        let decoded = try ContractFixtures.decode([Project].self, "[\(project)]")
        let sec = try XCTUnwrap(decoded.first)
        XCTAssertEqual(sec.key, ProjectKey("SEC"))
        XCTAssertEqual(sec.defaultMachine, ProjectDefaultMachine(computerID: "cmp_1", computerName: "Studio"))
        XCTAssertEqual(sec.homeAgentIDs, ["agent_1"])
        let none = try ContractFixtures.decode(Project.self, project.replacingOccurrences(
            of: #"{"computerId":"cmp_1","computerName":"Studio"}"#, with: "null"
        ))
        XCTAssertNil(none.defaultMachine)
    }

    func testAProjectWithAMalformedKeyOrMissingFieldFails() {
        XCTAssertThrowsError(try ContractFixtures.decode(Project.self, project.replacingOccurrences(of: #""key":"SEC""#, with: #""key":"sec""#)))
        XCTAssertThrowsError(try ContractFixtures.decode(Project.self, project.replacingOccurrences(of: #""isHaus":false,"#, with: "")))
    }

    func testMutationResultsDecode() throws {
        let result = try ContractFixtures.decode(ProjectMutationResult.self, #"{"chat":\#(ContractFixtures.chat),"project":\#(project)}"#)
        XCTAssertEqual(result.chat.id, "chat_sec")
        XCTAssertEqual(result.project.id, "chat_sec")
        let machine = try ContractFixtures.decode(ProjectDefaultMachineReceipt.self, #"{"computerId":"cmp_1"}"#)
        XCTAssertEqual(machine.computerID, "cmp_1")
        let cleared = try ContractFixtures.decode(ProjectDefaultMachineReceipt.self, #"{"computerId":null}"#)
        XCTAssertNil(cleared.computerID)
        let event = try ContractFixtures.decode(ProjectUpdatedEvent.self, #"{"projectId":"project_sec","serverId":"server_1"}"#)
        XCTAssertEqual(event.projectID, "project_sec")
    }

    func testTheProjectKeyFollowsTheServersKeyRule() {
        XCTAssertNil(ProjectKey("S"))
        XCTAssertNil(ProjectKey("SECURE"))
        XCTAssertNil(ProjectKey("1SEC"))
        XCTAssertEqual(ProjectKey(" SEC ")?.rawValue, "SEC")
        XCTAssertEqual(ProjectKey.suggested(forName: "security-team")?.rawValue, "SECU")
        XCTAssertEqual(ProjectKey.suggested(forName: "a")?.rawValue, "AX")
        XCTAssertEqual(ProjectKey.suggested(forName: "2026 plans")?.rawValue, "P202")
        XCTAssertNil(ProjectKey.suggested(forName: "--"))
        XCTAssertEqual(ProjectKey("SECU")?.suffixed(2)?.rawValue, "SECU2")
        XCTAssertEqual(ProjectKey("SECU")?.suffixed(12)?.rawValue, "SEC12")
    }

    func testCreateAndUpdateSendOnlyWhatTheyNameAndClearWithNull() throws {
        let create = try XCTUnwrap(ProjectCreateInput(name: "sec", serverID: "server_1", key: ProjectKey("SEC"), color: .set("violet")))
        XCTAssertEqual(try ContractFixtures.encoded(create), try ContractFixtures.object(
            #"{"color":"violet","key":"SEC","name":"sec","serverId":"server_1"}"#
        ))
        XCTAssertNil(ProjectCreateInput(name: "has space", serverID: "server_1"))
        let update = try XCTUnwrap(ProjectUpdateInput(chatID: "chat_sec", serverID: "server_1", icon: .clear))
        XCTAssertEqual(try ContractFixtures.encoded(update), try ContractFixtures.object(
            #"{"chatId":"chat_sec","icon":null,"serverId":"server_1"}"#
        ))
    }

    func testTheDefaultMachineInputSendsItsExactShapeAndClearsWithNull() throws {
        let set = ProjectSetDefaultMachineInput(computerID: "cmp_1", projectID: "chat_sec", serverID: "server_1")
        XCTAssertEqual(try ContractFixtures.encoded(set), try ContractFixtures.object(
            #"{"computerId":"cmp_1","projectId":"chat_sec","serverId":"server_1"}"#
        ))
        let clear = ProjectSetDefaultMachineInput(computerID: nil, projectID: "chat_sec", serverID: "server_1")
        XCTAssertEqual(try ContractFixtures.encoded(clear), try ContractFixtures.object(
            #"{"computerId":null,"projectId":"chat_sec","serverId":"server_1"}"#
        ))
    }

    func testTheProjectStreamKeepsTheProjectListLive() {
        XCTAssertEqual(RealtimeStream.projectUpdated.path, "project.onUpdated")
        XCTAssertTrue(RealtimeStream.liveSession.contains(.projectUpdated))
        XCTAssertEqual(RealtimeStream.projectUpdated.ownedProjections, [.projects])
        XCTAssertFalse(RealtimeStream.projectUpdated.reportsOutage)
    }
}
