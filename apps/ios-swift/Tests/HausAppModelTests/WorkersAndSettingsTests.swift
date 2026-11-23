import HausModels
import Testing
@testable import HausAppModel

@MainActor
@Suite("Workers and settings models")
struct WorkersAndSettingsTests {
    private let scope = ServerScope(serverID: "srv_a")

    @Test("Active Workers order by the reconciliation clock: an older answer never replaces a newer one")
    func activeWorkersReconcile() throws {
        let workers = WorkersModel(client: AppModelFixtures.client, scope: scope)
        let older = try workers.beginActiveRead()
        let newer = try workers.beginActiveRead()

        #expect(workers.landActive([], for: newer))
        #expect(!workers.landActive([], for: older))
        #expect(workers.active?.isEmpty == true)
    }

    @Test("Only queued and working Workers are happening now", arguments: WorkerStatus.allCases)
    func liveStatuses(status: WorkerStatus) {
        #expect(WorkersModel.isLive(status) == (status == .queued || status == .working))
    }

    @Test("A Chat's Workers stay unknown until asked for, and no Chat means no pull requests")
    func chatWorkersStartUnknown() throws {
        let workers = WorkersModel(client: AppModelFixtures.client, scope: scope)
        let read = try workers.beginChatRead(chatID: "chat_1")
        #expect(workers.byChatID["chat_1"] == nil)

        workers.landChat([], for: read)

        #expect(workers.byChatID["chat_1"]?.isEmpty == true)
        #expect(workers.pullRequests(chatID: "chat_1").isEmpty)
    }

    @Test("A denied Devices read that began first never blanks a newer answer")
    func deniedComputersReadIsOrdered() throws {
        let settings = SettingsModel(client: AppModelFixtures.client, scope: scope)
        let older = try settings.beginComputersRead()
        let newer = try settings.beginComputersRead()

        #expect(settings.landComputers([], for: newer))
        #expect(!settings.landComputers(nil, for: older))
        #expect(settings.computers?.isEmpty == true)
    }

    @Test("Reset after a switch drops every held read and every in-flight answer")
    func resetDropsEverything() throws {
        let settings = SettingsModel(client: AppModelFixtures.client, scope: scope)
        let workers = WorkersModel(client: AppModelFixtures.client, scope: scope)
        let computers = try settings.beginComputersRead()
        let active = try workers.beginActiveRead()
        scope.activate("srv_b")
        settings.reset()
        workers.reset()

        #expect(!settings.landComputers([], for: computers))
        #expect(!workers.landActive([], for: active))
        #expect(settings.computers == nil)
        #expect(workers.active == nil)
    }
}
