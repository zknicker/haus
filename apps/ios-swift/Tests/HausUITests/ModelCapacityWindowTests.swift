import Foundation
@testable import HausUI
import Testing

struct ModelCapacityWindowTests {
    private let now = Date(timeIntervalSince1970: 1_800_000_000)

    @Test func percentLeftRoundsAndClamps() {
        #expect(window(used: 36).percentLeft == 64)
        #expect(window(used: 42.5).percentLeft == 58)
        #expect(window(used: 81.6).percentLeft == 18)
        #expect(window(used: 120).percentLeft == 0)
        #expect(window(used: -5).percentLeft == 100)
    }

    @Test func groupCapacityLineReadsTheTightestWindow() {
        let group = ModelSheetGroup(
            id: "max",
            provider: .claude,
            label: "Zach’s Max",
            capacity: [window(used: 18), window(used: 36)],
            options: []
        )

        #expect(group.capacityLine == "64% left")
    }

    @Test func groupWithoutWindowsHasNoCapacityLine() {
        let group = ModelSheetGroup(id: "key", provider: .chatgpt, label: "API key", capacity: [], options: [])

        #expect(group.capacityLine == nil)
    }

    @Test func resetLineSteps() {
        #expect(window(used: 0, resetsIn: 45 * 60).resetLine(now: now) == "Resets in 45m")
        #expect(window(used: 0, resetsIn: 20).resetLine(now: now) == "Resets in 1m")
        #expect(window(used: 0, resetsIn: 3 * 3_600).resetLine(now: now) == "Resets in 3h")
        #expect(window(used: 0, resetsIn: 4 * 86_400).resetLine(now: now) == "Resets in 4d")
    }

    @Test func pastOrMissingResetHasNoLine() {
        #expect(window(used: 0, resetsIn: -60).resetLine(now: now) == nil)
        #expect(ModelCapacityWindow(id: "w", label: "Weekly", usedPercent: 0, resetsAt: nil).resetLine(now: now) == nil)
    }

    private func window(used: Double, resetsIn seconds: TimeInterval = 3_600) -> ModelCapacityWindow {
        ModelCapacityWindow(
            id: "w\(used)",
            label: "Weekly",
            usedPercent: used,
            resetsAt: now.addingTimeInterval(seconds)
        )
    }
}
