import Foundation
import HausModels
import Testing
@testable import HausUI

/// The bundled catalog, what it keeps for a device, and how search ranks.
struct EmojiCatalogTests {
    private let catalog = EmojiCatalog.bundled(maxVersion: 17.0)

    @Test func loadsEveryUnicodeGroupInOrder() {
        #expect(catalog.categories.map(\.name) == [
            "Smileys & Emotion", "People & Body", "Animals & Nature", "Food & Drink",
            "Travel & Places", "Activities", "Objects", "Symbols", "Flags",
        ])
        #expect(catalog.categories.first?.entries.first?.emoji == "😀")
        #expect(catalog.categories.reduce(0) { $0 + $1.entries.count } > 1_800)
    }

    /// Everything the picker can send is what the Server would accept, in the
    /// spelling it stores.
    @Test func everyEntryIsOneNormalizedServerEmoji() {
        for entry in catalog.categories.flatMap(\.entries) {
            #expect(ReactionEmoji.normalized(entry.emoji) == entry.emoji)
        }
    }

    /// Emoji newer than the OS draws would show as missing glyphs.
    @Test func dropsEmojiNewerThanTheDeviceDraws() {
        let older = EmojiCatalog.bundled(maxVersion: 15.1)
        // 🫩 (face with bags under eyes) is Emoji 16.0.
        #expect(catalog.entry(for: "🫩") != nil)
        #expect(older.entry(for: "🫩") == nil)
        #expect(older.entry(for: "🦖") != nil)
    }

    @Test func searchFindsByKeywordWhenTheNameDoesNotSayIt() {
        let found = catalog.search("dino").map(\.emoji)
        #expect(found.contains("🦖"))
        #expect(found.contains("🦕"))
    }

    @Test func exactNamesThenNamesThenKeywordsRankFirst() throws {
        let json = #"""
        {"groups":[{"name":"Test","emoji":[
          ["🚒","fire engine","0.6",0,""],
          ["🌶️","hot pepper","0.7",0,"fire spicy"],
          ["🔥","fire","0.6",0,"hot flame"]
        ]}]}
        """#
        let small = try EmojiCatalog.decode(Data(json.utf8), maxVersion: 17.0)
        #expect(small.search("fire").map(\.emoji) == ["🔥", "🚒", "🌶️"])
        #expect(catalog.search("fire").first?.emoji == "🔥")
    }

    @Test func everyQueryWordMustMatch() {
        let found = catalog.search("red heart").map(\.emoji)
        #expect(found.first == "❤️")
        #expect(!found.contains("💙"))
        #expect(catalog.search("   ").isEmpty)
        #expect(catalog.search("zzzzqqq").isEmpty)
    }

    @Test func tonesApplyToEveryPersonButNotTheHandshakeBetweenThem() {
        #expect(EmojiSkinTone.medium.applied(to: "👍") == "👍🏽")
        #expect(EmojiSkinTone.dark.applied(to: "🖐️") == "🖐🏿")
        #expect(EmojiSkinTone.light.applied(to: "🧑‍🤝‍🧑") == "🧑🏻‍🤝‍🧑🏻")
        #expect(EmojiSkinTone.base(of: "👍🏽") == "👍")
        #expect(catalog.entry(for: "👍🏽")?.name == "thumbs up")
    }
}
