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

    /// Only the Server-wide default lens knows how many tasks were hidden.
    @Test func onlyTheDefaultServerWideReadRecordsTheHiddenCount() {
        #expect(TaskBackgroundLens.recordsHiddenCount(chatID: nil, includeBackground: false))
    }

    /// Widening reports zero hidden, which is true of the widened read and
    /// false of the control: recording it would blank the number the reader
    /// needs to narrow the lens again.
    @Test func aWidenedReadKeepsTheCountItWouldZero() {
        #expect(!TaskBackgroundLens.recordsHiddenCount(chatID: nil, includeBackground: true))
    }

    @Test func aChatScopedReadAnswersADifferentQuestion() {
        #expect(!TaskBackgroundLens.recordsHiddenCount(chatID: "chat_1", includeBackground: false))
        #expect(!TaskBackgroundLens.recordsHiddenCount(chatID: "chat_1", includeBackground: true))
    }

    @Test func widenedFixturesCarryBothTiers() {
        #expect(TaskPreviewFixtures.items.allSatisfy { $0.task.tier == .tracked })
        #expect(TaskPreviewFixtures.backgroundItems.allSatisfy { $0.task.tier == .background })
        #expect(TaskPreviewFixtures.widenedItems.count == TaskPreviewFixtures.items.count + 1)
    }
}
