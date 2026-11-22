import Foundation
import XCTest
@testable import HausModels

final class ProjectContractTests: XCTestCase {
    private let project = """
    {"archived":false,"chatId":"chat_sec","defaultWorkerPlace":{"computerId":"cmp_1","computerName":null,"kind":"computer"},
     "homeAgentIds":["agent_1"],"id":"project_sec","isHaus":false,"key":"SEC","keyEditable":true,"name":"sec",
     "repos":[{"id":"repo_1","links":[{"checkoutPath":null,"computerId":"cmp_1","computerName":"Studio"}],
       "repository":"haus/haus"}],
     "serverId":"server_1","taskKeyId":"key_sec"}
    """

    func testEveryProjectProcedureNamesItsServerPath() {
        XCTAssertEqual(ProjectProcedures.list.path, "project.list")
        XCTAssertEqual(ProjectProcedures.list.kind, .query)
        XCTAssertEqual(ProjectProcedures.create.path, "project.create")
        XCTAssertEqual(ProjectProcedures.update.path, "project.update")
        XCTAssertEqual(ProjectProcedures.addRepo.path, "project.addRepo")
        XCTAssertEqual(ProjectProcedures.removeRepo.path, "project.removeRepo")
        XCTAssertEqual(ProjectProcedures.linkRepo.path, "project.linkRepo")
        XCTAssertEqual(ProjectProcedures.unlinkRepo.path, "project.unlinkRepo")
        XCTAssertEqual(ProjectProcedures.setDefaultWorkerPlace.path, "project.setDefaultWorkerPlace")
        XCTAssertEqual(ProjectProcedures.setDefaultWorkerPlace.kind, .mutation)
    }

    func testAProjectDecodesItsReposAndDefaultPlace() throws {
        let decoded = try ContractFixtures.decode([Project].self, "[\(project)]")
        let sec = try XCTUnwrap(decoded.first)
        XCTAssertEqual(sec.key, ProjectKey("SEC"))
        XCTAssertEqual(sec.defaultWorkerPlace?.computerId, "cmp_1")
        XCTAssertEqual(sec.repos.first?.links.first?.computerName, "Studio")
        XCTAssertNil(sec.repos.first?.links.first?.checkoutPath)
        XCTAssertEqual(sec.homeAgentIDs, ["agent_1"])
    }

    func testAProjectWithAMalformedKeyOrMissingFieldFails() {
        XCTAssertThrowsError(try ContractFixtures.decode(Project.self, project.replacingOccurrences(of: #""key":"SEC""#, with: #""key":"sec""#)))
        XCTAssertThrowsError(try ContractFixtures.decode(Project.self, project.replacingOccurrences(of: #""isHaus":false,"#, with: "")))
    }

    func testMutationResultsDecode() throws {
        let result = try ContractFixtures.decode(ProjectMutationResult.self, #"{"chat":\#(ContractFixtures.chat),"project":\#(project)}"#)
        XCTAssertEqual(result.chat.id, "chat_sec")
        XCTAssertEqual(result.project.id, "project_sec")
        let added = try ContractFixtures.decode(ProjectRepoAdded.self, #"{"projectRepoId":"repo_2","repository":"haus/site"}"#)
        XCTAssertEqual(added.projectRepoID, "repo_2")
        let linked = try ContractFixtures.decode(ProjectRepoLinkReceipt.self, #"{"computerId":"cmp_1","projectRepoId":"repo_2"}"#)
        XCTAssertEqual(linked.computerID, "cmp_1")
        let removed = try ContractFixtures.decode(ProjectRepoRemoved.self, #"{"projectRepoId":"repo_2"}"#)
        XCTAssertEqual(removed.projectRepoID, "repo_2")
        let cleared = try ContractFixtures.decode(ProjectDefaultWorkerPlace.self, #"{"place":null}"#)
        XCTAssertNil(cleared.place)
        let cloud = try ContractFixtures.decode(ProjectDefaultWorkerPlace.self, #"{"place":{"kind":"cursor"}}"#)
        XCTAssertEqual(cloud.place, .cursor)
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

    func testRepoAndPlaceInputsSendTheirExactShapes() throws {
        let add = try XCTUnwrap(ProjectRepoInput(projectID: "project_sec", repository: "haus/haus", serverID: "server_1"))
        XCTAssertEqual(try ContractFixtures.encoded(add), try ContractFixtures.object(
            #"{"projectId":"project_sec","repository":"haus/haus","serverId":"server_1"}"#
        ))
        XCTAssertNil(ProjectRepoInput(projectID: "p", repository: "haus", serverID: "s"))
        let link = ProjectRepoLinkInput(checkoutPath: nil, computerID: "cmp_1", projectRepoID: "repo_1", serverID: "server_1")
        XCTAssertEqual(try ContractFixtures.encoded(link), try ContractFixtures.object(
            #"{"checkoutPath":null,"computerId":"cmp_1","projectRepoId":"repo_1","serverId":"server_1"}"#
        ))
        let unlink = ProjectRepoUnlinkInput(computerID: "cmp_1", projectRepoID: "repo_1", serverID: "server_1")
        XCTAssertEqual(try ContractFixtures.encoded(unlink), try ContractFixtures.object(
            #"{"computerId":"cmp_1","projectRepoId":"repo_1","serverId":"server_1"}"#
        ))
        let remove = ProjectRepoTarget(projectRepoID: "repo_1", serverID: "server_1")
        XCTAssertEqual(try ContractFixtures.encoded(remove), try ContractFixtures.object(
            #"{"projectRepoId":"repo_1","serverId":"server_1"}"#
        ))
        let place = ProjectDefaultWorkerPlaceInput(place: .computer(id: "cmp_1"), projectID: "project_sec", serverID: "server_1")
        XCTAssertEqual(try ContractFixtures.encoded(place), try ContractFixtures.object(
            #"{"place":{"computerId":"cmp_1","kind":"computer"},"projectId":"project_sec","serverId":"server_1"}"#
        ))
        let ask = ProjectDefaultWorkerPlaceInput(place: nil, projectID: "project_sec", serverID: "server_1")
        XCTAssertEqual(try ContractFixtures.encoded(ask), try ContractFixtures.object(
            #"{"place":null,"projectId":"project_sec","serverId":"server_1"}"#
        ))
    }

    func testTheProjectStreamWaitsOutsideTheLiveSession() {
        XCTAssertEqual(RealtimeStream.projectUpdated.path, "project.onUpdated")
        XCTAssertFalse(RealtimeStream.projectUpdated.joinsLiveSession)
        XCTAssertTrue(RealtimeStream.projectUpdated.ownedProjections.isEmpty)
    }
}
