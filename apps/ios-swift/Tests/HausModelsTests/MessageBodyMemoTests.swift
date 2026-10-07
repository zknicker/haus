import Foundation
import Testing
@testable import HausModels

@Suite("Message body memo")
struct MessageBodyMemoTests {
    private func value<V>(
        _ memo: inout MessageBodyMemo<V>, id: String, content: String, revision: Int, build: () -> V
    ) -> V {
        if let cached = memo.cached(id: id, content: content, revision: revision) { return cached }
        let built = build()
        memo.remember(built, id: id, content: content, revision: revision)
        return built
    }

    @Test("An unchanged body at the same reference revision is never reparsed")
    func reusesUnchangedBodies() {
        var memo = MessageBodyMemo<String>()
        var parses = 0
        let parse = { () -> String in parses += 1; return "parsed" }

        _ = value(&memo, id: "m1", content: "hello", revision: 0, build: parse)
        _ = value(&memo, id: "m1", content: "hello", revision: 0, build: parse)

        #expect(parses == 1)
    }

    @Test("Edited content and a new reference revision both reparse")
    func reparsesOnContentOrRevision() {
        var memo = MessageBodyMemo<String>()
        var parses = 0
        let parse = { () -> String in parses += 1; return "parsed" }

        _ = value(&memo, id: "m1", content: "hello", revision: 0, build: parse)
        _ = value(&memo, id: "m1", content: "hello, edited", revision: 0, build: parse)
        _ = value(&memo, id: "m1", content: "hello, edited", revision: 1, build: parse)

        #expect(parses == 3)
    }

    @Test("Past capacity the memo starts over instead of growing")
    func boundedByCapacity() {
        var memo = MessageBodyMemo<Int>(capacity: 2)
        _ = value(&memo, id: "a", content: "", revision: 0) { 1 }
        _ = value(&memo, id: "b", content: "", revision: 0) { 2 }
        _ = value(&memo, id: "c", content: "", revision: 0) { 3 }
        #expect(memo.count == 1)
    }

    @Test("Only the keys whose values changed are reported")
    func keyedChanges() {
        let old = ["a": 1, "b": 2, "c": 3]
        let new = ["a": 1, "b": 20, "d": 4]
        #expect(KeyedChanges.between(old, new) == ["b", "c", "d"])
        #expect(KeyedChanges.between(old, old).isEmpty)
    }
}

@Suite("Reference directory")
struct ReferenceDirectoryTests {
    @Test("Presence-only Agent changes leave reference chips alone")
    func presenceIsNotAReferenceChange() throws {
        var directory = ReferenceDirectory()
        let agents = HausPreviewFixtures.agents
        let changed1 = directory.update(agents: agents)
        #expect(changed1)

        let working = try agents.map { try rewrite($0) { $0["availability"] = "working" } }
        #expect(working != agents)
        let changed2 = directory.update(agents: working)
        #expect(!changed2)

        let renamed = try agents.map { try rewrite($0) { $0["displayName"] = "Renamed" } }
        let changed3 = directory.update(agents: renamed)
        #expect(changed3)
    }

    @Test("Unread counts and reordering leave channel chips alone; a rename does not")
    func chatListChurnIsNotAReferenceChange() throws {
        var directory = ReferenceDirectory()
        let chats = HausPreviewFixtures.chats
        let changed4 = directory.update(chats: chats)
        #expect(changed4)

        let churned = try chats.reversed().map { try rewrite($0) { $0["unreadCount"] = 7 } }
        let changed5 = directory.update(chats: churned)
        #expect(!changed5)

        let renamed = try chats.map { chat in
            try rewrite(chat) { if $0["name"] is String { $0["name"] = "renamed" } }
        }
        let changed6 = directory.update(chats: renamed)
        #expect(changed6)
    }

    private func rewrite<Value: Codable>(
        _ value: Value,
        _ edit: (inout [String: Any]) -> Void
    ) throws -> Value {
        let data = try HausJSON.encoder().encode(value)
        var object = try #require(JSONSerialization.jsonObject(with: data) as? [String: Any])
        edit(&object)
        let edited = try JSONSerialization.data(withJSONObject: object)
        return try HausJSON.decoder().decode(Value.self, from: edited)
    }
}
