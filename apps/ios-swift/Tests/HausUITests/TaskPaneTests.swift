import CoreGraphics
import HausModels
import Testing
@testable import HausUI

@Suite("Task pane and its composer")
struct TaskPaneTests {
    @Test("Until the Task loads, Activity and Files stay blank instead of claiming nothing is there")
    func blankWhileTheTaskLoads() {
        let loading = TaskPaneAgent(isLoaded: false, agentID: nil)
        #expect(loading == .loading)
        #expect(loading.files([]) == nil)
        #expect(loading.id == nil)
    }

    @Test("A loaded Task from before Tasks were agents shows its empty states")
    func agentlessTaskIsTrulyEmpty() {
        let agentless = TaskPaneAgent(isLoaded: true, agentID: nil)
        #expect(agentless == .none)
        #expect(agentless.files(nil) == [])
    }

    @Test("A Task's agent shows its files once they load, and blank until then")
    func agentFiles() throws {
        let agent = TaskPaneAgent(isLoaded: true, agentID: "agt_forge")
        #expect(agent.id == "agt_forge")
        #expect(agent.files(nil) == nil)
        let file = DriveFilePresentation(record: try DriveFixture.record(path: "tasks/report.md", contentType: "text/markdown"))
        #expect(agent.files([file]) == [file])
    }

    @Test("A Task's chip and an inline reply never share the composer")
    func chipDropsTheReply() {
        let chip = ComposerTaskChip(title: "Price the 3XL run", disc: .active(nil))
        #expect(ComposerReplyRule.reply("msg_1", beside: chip) == nil)
        #expect(ComposerReplyRule.reply("msg_1", beside: nil) == "msg_1")
    }

    @Test("A closing Task pane keeps the frame it had open while it leaves")
    func closingPaneLeavesFromItsOpenFrame() {
        let size = CGSize(width: 801, height: 600)
        let open = TaskModePanes.placements(size: size, fold: nil, isOpen: true)
        let closing = TaskModePanes.placements(size: size, fold: nil, isOpen: false)
        #expect(open == [CGRect(x: 0, y: 0, width: 400, height: 600), CGRect(x: 400, y: 0, width: 401, height: 600)])
        #expect(closing == [CGRect(origin: .zero, size: size), CGRect(x: 400, y: 0, width: 401, height: 600)])
    }
}
