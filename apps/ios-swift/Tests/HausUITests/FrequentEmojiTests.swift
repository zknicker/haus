import Foundation
import Testing
@testable import HausUI

/// The device-local frequently used list behind the quick tiles.
struct FrequentEmojiTests {
    private func store() -> FrequentEmoji {
        let suite = "FrequentEmojiTests.\(UUID().uuidString)"
        return FrequentEmoji(defaults: UserDefaults(suiteName: suite)!, key: "frequent")
    }

    @Test func aFirstLaunchShowsTheSeedInOrder() {
        #expect(store().ordered() == FrequentEmoji.seed)
    }

    @Test func anyUseOutranksEverySeed() {
        let frequent = store()
        frequent.record("🦖")
        #expect(frequent.ordered().prefix(2) == ["🦖", "👍"])
        #expect(frequent.ordered().count == FrequentEmoji.seed.count + 1)
    }

    @Test func countsRankFirstThenRecency() {
        let frequent = store()
        let start = Date(timeIntervalSinceReferenceDate: 0)
        frequent.record("🔥", at: start)
        frequent.record("🦖", at: start.addingTimeInterval(1))
        frequent.record("🔥", at: start.addingTimeInterval(2))
        frequent.record("🎉", at: start.addingTimeInterval(3))
        #expect(frequent.ordered().prefix(3) == ["🔥", "🎉", "🦖"])
    }

    @Test func aNewPickSurvivesAFullList() {
        let frequent = store()
        let start = Date(timeIntervalSinceReferenceDate: 0)
        for index in 0..<FrequentEmoji.capacity {
            let emoji = String(UnicodeScalar(0x1F330 + index)!)
            frequent.record(emoji, at: start)
            frequent.record(emoji, at: start)
        }
        frequent.record("🦖", at: start.addingTimeInterval(1))
        let ordered = frequent.ordered()
        #expect(ordered.contains("🦖"))
        #expect(ordered.count == FrequentEmoji.capacity + FrequentEmoji.seed.count)
    }
}
