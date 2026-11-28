import Foundation
import HausModels
import Testing
@testable import HausAppModel

@Suite("Work routes")
struct WorkRoutesTests {
    @Test("Each Work route draws its own screen")
    func routesMapToScreens() {
        let reading = PullRequestReading(number: 441, repository: "haus/haus", state: "open", url: "https://github.com/haus/haus/pull/441")
        #expect(RouteScreen(.work(.chat("chat_1"))) == .work(.chat("chat_1")))
        #expect(RouteScreen(.work(.task("tsk_1"))) == .work(.task("tsk_1")))
        #expect(RouteScreen(.pullRequest(reading)) == .pullRequest(reading))
        #expect(RouteScreen(.task(taskID: "tsk_1", messageID: "msg_1")) == .task(taskID: "tsk_1"))
        #expect(RouteScreen(.captain(agentID: "agt_1")) == .conversation)
        #expect(RouteScreen(.settings(.computers)) == .settings(.computers))
    }

    @Test("A Drive route names a folder by its trailing slash, and a file otherwise")
    func driveRoutesSplitFoldersFromFiles() {
        #expect(RouteScreen(.driveFile(path: "projects/haus/release.md")) == .driveFile(path: "projects/haus/release.md"))
        #expect(RouteScreen(.driveFile(path: "projects/haus/")) == .driveFolder(prefix: "projects/haus/"))
        #expect(RouteScreen(.driveFile(path: "")) == .driveFolder(prefix: ""))
        #expect(DrivePath.folder("projects/haus") == "projects/haus/")
        #expect(DrivePath.folder("projects/haus/") == "projects/haus/")
    }
}
