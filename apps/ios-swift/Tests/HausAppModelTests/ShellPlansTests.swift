import Foundation
import HausModels
import Testing
@testable import HausAppModel

@Suite("Ask anything and first run")
struct ShellPlansTests {
    @Test("The ask is the Task's first message, trimmed, on the picked Machine and model")
    func askStartsATask() throws {
        let input = try #require(AskAnythingPlan.task(
            text: "  Ship the tab bar\n\nKeep the drawer for now. ",
            projectID: "p",
            model: "gpt-5",
            computerID: "cmp_1",
            requestID: "req_1",
            serverID: "s"
        ))
        #expect(input.prompt == "Ship the tab bar\n\nKeep the drawer for now.")
        #expect(input.projectID == "p")
        #expect(input.model == "gpt-5")
        #expect(input.computerID == "cmp_1")
        #expect(input.requestID == "req_1")
        #expect(input.serverID == "s")
    }

    @Test("A blank ask, or one with no model, starts no Task")
    func blankAskStartsNothing() {
        #expect(AskAnythingPlan.task(text: " \n ", projectID: "p", model: "gpt-5", computerID: nil, requestID: "r", serverID: "s") == nil)
        #expect(AskAnythingPlan.task(text: "Fix it", projectID: "p", model: "", computerID: nil, requestID: "r", serverID: "s") == nil)
    }

    @Test("No Machine leaves the Project's default to the Server")
    func noMachineIsOmitted() throws {
        let input = try #require(
            AskAnythingPlan.task(text: "Fix it", projectID: "p", model: "gpt-5", computerID: nil, requestID: "r", serverID: "s")
        )
        let json = try JSONSerialization.jsonObject(with: JSONEncoder().encode(input)) as? [String: Any]
        #expect(json?["computerId"] == nil)
        #expect(json?["prompt"] as? String == "Fix it")
    }

    @Test("The pick wins while listed, then the preferred one, then the first")
    func choice() {
        let ids = ["a", "b", "c"]
        #expect(AskAnythingPlan.choice(ids, picked: "c", preferred: "b") == "c")
        #expect(AskAnythingPlan.choice(ids, picked: "gone", preferred: "b") == "b")
        #expect(AskAnythingPlan.choice(ids, picked: nil, preferred: "gone") == "a")
        #expect(AskAnythingPlan.choice([], picked: nil) == nil)
    }

    @Test("A Server with a Project and a Captain needs no first run")
    func readyServer() {
        #expect(FirstRunCopy.needed(projectCount: 1, captainCount: 1, deviceCount: 0, canManage: true) == nil)
    }

    @Test("An Owner on a fresh Server connects a Device and creates a Project")
    func freshServerOwner() throws {
        let copy = try #require(FirstRunCopy.needed(projectCount: 0, captainCount: 0, deviceCount: 0, canManage: true))
        #expect(copy.title == "Set up your Haus")
        #expect(copy.actions == [.connectDevice, .newProject])
        #expect(copy.description.contains("connect one before adding a Captain"))
    }

    @Test("A Member on a fresh Server can still create a Project and learns who adds Captains")
    func freshServerMember() throws {
        let copy = try #require(FirstRunCopy.needed(projectCount: 0, captainCount: 0, deviceCount: 0, canManage: false))
        #expect(copy.actions == [.newProject])
        #expect(copy.description.contains("An Owner or Admin connects a Device"))
    }

    @Test("With a Device and no Captain, an Owner adds one")
    func deviceButNoCaptain() throws {
        let copy = try #require(FirstRunCopy.needed(projectCount: 2, captainCount: 0, deviceCount: 1, canManage: true))
        #expect(copy.title == "Add your first Captain")
        #expect(copy.actions == [.newCaptain])
    }
}
