import HausModels
@testable import HausUI
import Testing

struct TaskBackgroundLensTests {
    @Test func staysAwayOnAServerWithNoBackgroundClaims() {
        let label = TaskBackgroundLens.label(
            items: TaskPreviewFixtures.items,
            hiddenCount: 0,
            includeBackground: false
        )

        #expect(label == nil)
    }

    @Test func statesWhatTheDefaultLensHid() {
        let label = TaskBackgroundLens.label(
            items: TaskPreviewFixtures.items,
            hiddenCount: 3,
            includeBackground: false
        )

        #expect(label == "3 background")
    }

    @Test func statesWhatTheWidenedLensShows() {
        let label = TaskBackgroundLens.label(
            items: TaskPreviewFixtures.widenedItems,
            hiddenCount: 0,
            includeBackground: true
        )

        #expect(label == "1 background shown")
    }

    @Test func keepsTheWayBackOutOfAnEmptyWidenedLens() {
        let label = TaskBackgroundLens.label(items: [], hiddenCount: 0, includeBackground: true)

        #expect(label == "0 background shown")
    }

    @Test func widenedFixturesCarryBothTiers() {
        #expect(TaskPreviewFixtures.items.allSatisfy { $0.task.tier == .tracked })
        #expect(TaskPreviewFixtures.backgroundItems.allSatisfy { $0.task.tier == .background })
        #expect(TaskPreviewFixtures.widenedItems.count == TaskPreviewFixtures.items.count + 1)
    }
}
