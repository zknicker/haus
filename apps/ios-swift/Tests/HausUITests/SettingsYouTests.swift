import Foundation
import HausModels
@testable import HausUI
import Testing

struct SettingsYouTests {
    @Test func cardGeometryMatchesTheMocks() {
        #expect(HausRadius.settingsCard == 26)
        #expect(SettingsCardMetrics.rowHeight == 52)
        #expect(SettingsCardMetrics.titleInset == 56)
        #expect(SettingsCardMetrics.separatorLeading(hasIcon: true) == 56)
        #expect(SettingsCardMetrics.separatorLeading(hasIcon: false) == 20)
    }

    @Test func devicesShowTheOneNameOrHowMany() {
        #expect(data(computers: nil).devicesValue == nil)
        #expect(data(computers: []).devicesValue == nil)
        #expect(data(computers: [computer("a", "mini")]).devicesValue == "mini")
        #expect(data(computers: [computer("a", "mini"), computer("b", "studio")]).devicesValue == "2")
    }

    @Test func onlyOwnersAndAdminsManageTheServer() {
        #expect(data(role: "Owner").canManageServer)
        #expect(data(role: "admin").canManageServer)
        #expect(!data(role: "Member").canManageServer)
    }

    @Test func aConnectionSaysWhetherItIsReadyAndWhatIsLeft() {
        let window = ModelCapacityWindow(id: "w", label: "Week", usedPercent: 36, resetsAt: nil)
        let ready = SettingsModelConnection(id: "c", provider: .claude, label: "Max", capacity: [window])
        #expect(ready.title == "Claude · Max")
        #expect(ready.statusLabel == "Ready")
        #expect(ready.detailLine == "64% left")

        let failed = SettingsModelConnection(id: "g", provider: .chatgpt, label: "Pro", isReady: false, statusDetail: "Sign in again.")
        #expect(failed.statusLabel == "Needs attention")
        #expect(failed.detailLine == "Sign in again.")

        let off = SettingsModelConnection(id: "o", provider: .xai, label: "Grok", isEnabled: false, isReady: false)
        #expect(off.statusLabel == "Off")
        #expect(off.detailLine == nil)
    }

    @Test func automationCountsReadAsOneShortValue() {
        #expect(AutomationCounts(reminders: 0, triggers: 0).label == "None")
        #expect(AutomationCounts(reminders: 1, triggers: 0).label == "1 reminder")
        #expect(AutomationCounts(reminders: 2, triggers: 1).label == "2 reminders · 1 trigger")
    }

    @Test func automationCountsOnlyCountRemindersStillComing() async {
        let counts = await AutomationCounts.load(agentID: "agent-blippy", actions: .preview)
        #expect(counts == AutomationCounts(reminders: 2, triggers: 1))
    }

    @Test func aDriveFolderIsTitledByItsLastSegment() {
        #expect(SettingsDriveView.title(prefix: "") == "Drive")
        #expect(SettingsDriveView.title(prefix: "projects/product/") == "product")
        #expect(SettingsDriveView.title(prefix: "agents/blippy") == "blippy")
    }

    private func data(role: String = "Owner", computers: [SettingsComputer]? = nil) -> SettingsData {
        SettingsData(
            server: SettingsServer(id: "s", name: "Haus", slug: "haus", role: role, memberCount: 1, agentCount: 0),
            viewer: SettingsFixtures.viewer,
            agents: [],
            computers: computers
        )
    }

    private func computer(_ id: String, _ name: String) -> SettingsComputer {
        SettingsComputer(id: id, name: name, health: "Online", isHealthy: true, system: "Mac", version: "v1")
    }
}
