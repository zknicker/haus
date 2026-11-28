import HausModels
import Testing
@testable import HausAppModel

@MainActor
@Suite("Settings model")
struct SettingsModelTests {
    private let scope = ServerScope(serverID: "srv_a")

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
        let computers = try settings.beginComputersRead()
        scope.activate("srv_b")
        settings.reset()

        #expect(!settings.landComputers([], for: computers))
        #expect(settings.computers == nil)
    }
}
