import HausModels
import Testing
@testable import HausAppModel

@Suite("Ask anything and first run")
struct ShellPlansTests {
    @Test("The first line titles the Task and the rest describes it")
    func firstLineTitles() throws {
        let input = try #require(
            AskAnythingPlan.task(text: "  Ship the tab bar\n\nKeep the drawer for now. ", projectID: "p", captainID: "a", serverID: "s")
        )
        #expect(input.title == "Ship the tab bar")
        #expect(input.description == "Keep the drawer for now.")
        #expect(input.projectID == "p")
        #expect(input.assigneeAgentID == "a")
        #expect(input.serverID == "s")
    }

    @Test("A one-line ask has no description, and a blank ask makes no Task")
    func oneLineAndBlank() {
        #expect(AskAnythingPlan.task(text: "Fix it", projectID: "p", captainID: "a", serverID: "s")?.description == nil)
        #expect(AskAnythingPlan.task(text: " \n ", projectID: "p", captainID: "a", serverID: "s") == nil)
    }

    @Test("A lead too long for a title is cut, and the whole ask becomes the description")
    func longLeadIsCut() throws {
        let lead = String(repeating: "a", count: TaskText.titleMaxCharacters + 5)
        let input = try #require(AskAnythingPlan.task(text: lead + "\nmore", projectID: "p", captainID: "a", serverID: "s"))
        #expect(input.title.count == TaskText.titleMaxCharacters)
        #expect(input.title.hasSuffix("…"))
        #expect(input.description == lead + "\nmore")
    }

    @Test("The picked Captain wins, then the Project's, then the first")
    func captainChoice() {
        let ids = ["a", "b", "c"]
        #expect(AskAnythingPlan.captainID(captainIDs: ids, picked: "c", projectCaptainIDs: ["b"]) == "c")
        #expect(AskAnythingPlan.captainID(captainIDs: ids, picked: "gone", projectCaptainIDs: ["x", "b"]) == "b")
        #expect(AskAnythingPlan.captainID(captainIDs: ids, picked: nil, projectCaptainIDs: []) == "a")
        #expect(AskAnythingPlan.captainID(captainIDs: [], picked: nil, projectCaptainIDs: []) == nil)
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
