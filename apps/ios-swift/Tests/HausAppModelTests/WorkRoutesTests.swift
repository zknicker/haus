import Foundation
import HausModels
import Testing
@testable import HausAppModel

@Suite("Work routes and Worker reads")
struct WorkRoutesTests {
    @Test("Each Work route draws its own screen")
    func routesMapToScreens() {
        let reading = PullRequestReading(number: 441, repository: "haus/haus", state: "open", url: "https://github.com/haus/haus/pull/441")
        #expect(RouteScreen(.work(.chat("chat_1"))) == .work(.chat("chat_1")))
        #expect(RouteScreen(.work(.task("tsk_1"))) == .work(.task("tsk_1")))
        #expect(RouteScreen(.worker(workerID: "wrk_1")) == .worker(workerID: "wrk_1"))
        #expect(RouteScreen(.pullRequest(reading)) == .pullRequest(reading))
        #expect(RouteScreen(.task(taskID: "tsk_1", messageID: "msg_1")) == .task(taskID: "tsk_1"))
        #expect(RouteScreen(.captainDM(agentID: "agt_1")) == .conversation)
        #expect(RouteScreen(.settings(.cloudAgents)) == .none)
    }

    @Test("A Drive route names a folder by its trailing slash, and a file otherwise")
    func driveRoutesSplitFoldersFromFiles() {
        #expect(RouteScreen(.driveFile(path: "projects/haus/release.md")) == .driveFile(path: "projects/haus/release.md"))
        #expect(RouteScreen(.driveFile(path: "projects/haus/")) == .driveFolder(prefix: "projects/haus/"))
        #expect(RouteScreen(.driveFile(path: "")) == .driveFolder(prefix: ""))
        #expect(DrivePath.folder("projects/haus") == "projects/haus/")
        #expect(DrivePath.folder("projects/haus/") == "projects/haus/")
    }

    @MainActor
    @Test("A Worker view reads the Worker's own record first, then any list that carries it")
    func workerLookupPrefersItsOwnRead() throws {
        let workers = WorkersModel(client: AppModelFixtures.client, scope: ServerScope(serverID: "srv_a"))
        let listed = try WorkerFixture.chatWorker(id: "wrk_1", title: "Listed")
        let fetched = try WorkerFixture.worker(id: "wrk_1", title: "Fetched")
        #expect(workers.worker(id: "wrk_1") == nil)

        workers.landChat([listed], for: try workers.beginChatRead(chatID: "chat_1"))
        #expect(workers.worker(id: "wrk_1")?.title == "Listed")

        workers.landWorker(fetched, for: try workers.beginWorkerRead(id: "wrk_1"))
        #expect(workers.worker(id: "wrk_1")?.title == "Fetched")
    }

    @MainActor
    @Test("An older Worker read never replaces a newer one")
    func workerReadsAreOrdered() throws {
        let workers = WorkersModel(client: AppModelFixtures.client, scope: ServerScope(serverID: "srv_a"))
        let older = try workers.beginWorkerRead(id: "wrk_1")
        let newer = try workers.beginWorkerRead(id: "wrk_1")

        #expect(workers.landWorker(try WorkerFixture.worker(id: "wrk_1", title: "New"), for: newer))
        #expect(!workers.landWorker(try WorkerFixture.worker(id: "wrk_1", title: "Old"), for: older))
        #expect(workers.byID["wrk_1"]?.title == "New")
    }

    @MainActor
    @Test("A Worker event refreshes held lists it names, its parent places, and lists already carrying it")
    func workerEventsReachEveryHeldList() throws {
        let workers = WorkersModel(client: AppModelFixtures.client, scope: ServerScope(serverID: "srv_a"))
        let worker = try WorkerFixture.chatWorker(id: "wrk_1", title: "Seam")
        workers.landChat([], for: try workers.beginChatRead(chatID: "task_chat"))
        workers.landChat([], for: try workers.beginChatRead(chatID: "dm_chat"))
        workers.landChat([worker], for: try workers.beginChatRead(chatID: "project_chat"))
        workers.landChat([], for: try workers.beginChatRead(chatID: "other_chat"))

        let affected = workers.heldChats(affectedBy: ["wrk_1"], in: ["task_chat", "dm_chat", "never_held"])

        #expect(affected == ["task_chat", "dm_chat", "project_chat"])
    }
}

enum WorkerFixture {
    static func worker(id: String, title: String) throws -> Worker {
        try HausJSON.decoder().decode(Worker.self, from: Data(json(id: id, title: title).utf8))
    }

    static func chatWorker(id: String, title: String) throws -> ChatWorker {
        let row = #"{"anchorMessageId":"msg_1","worker":\#(json(id: id, title: title))}"#
        return try HausJSON.decoder().decode(ChatWorker.self, from: Data(row.utf8))
    }

    private static func json(id: String, title: String) -> String {
        """
        {"activity":null,"agentId":"agt_1","taskId":"tsk_1","createdAt":"2026-11-20T10:00:00.000Z","id":"\(id)",
         "job":{"followUp":null,"startedAt":"2026-11-20T10:00:00.000Z","state":"working"},
         "place":{"kind":"claude"},"providerUrl":null,"pullRequests":[],"repository":"haus/haus","turns":[],
         "startedAt":"2026-11-20T10:00:00.000Z","startingRef":null,"status":"working","terminalAt":null,
         "title":"\(title)","updatedAt":"2026-11-20T10:00:00.000Z"}
        """
    }
}
