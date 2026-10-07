import Foundation
import Testing
@testable import HausModels

@Suite("Launch snapshot")
struct LaunchSnapshotTests {
    @Test("A saved snapshot reads back identically for the same user")
    func roundTrip() async throws {
        let store = LaunchSnapshotStore(fileURL: temporaryFile())
        let snapshot = fixtureSnapshot(userID: "user_preview")

        try await store.save(snapshot)
        let loaded = await store.load(userID: "user_preview")

        #expect(loaded == snapshot)
        #expect(loaded?.serverID == HausPreviewFixtures.server.id)
    }

    @Test("Another user's snapshot is never painted, and is deleted")
    func otherUserIsDiscarded() async throws {
        let url = temporaryFile()
        let store = LaunchSnapshotStore(fileURL: url)
        try await store.save(fixtureSnapshot(userID: "user_a"))

        #expect(await store.load(userID: "user_b") == nil)
        #expect(!FileManager.default.fileExists(atPath: url.path))
    }

    @Test("A different format version or a corrupt file is discarded")
    func versionMismatchIsDiscarded() async throws {
        let url = temporaryFile()
        let store = LaunchSnapshotStore(fileURL: url)
        try await store.save(fixtureSnapshot(userID: "user_preview"))
        let data = try Data(contentsOf: url)
        var object = try #require(JSONSerialization.jsonObject(with: data) as? [String: Any])
        object["version"] = LaunchSnapshot.currentVersion + 1
        try JSONSerialization.data(withJSONObject: object).write(to: url)

        #expect(await store.load(userID: "user_preview") == nil)
        #expect(!FileManager.default.fileExists(atPath: url.path))

        try Data("{not json".utf8).write(to: url)
        #expect(await store.load(userID: "user_preview") == nil)
        #expect(!FileManager.default.fileExists(atPath: url.path))
    }

    @Test("Clearing on sign-out leaves nothing to paint")
    func clearRemovesTheSnapshot() async throws {
        let store = LaunchSnapshotStore(fileURL: temporaryFile())
        try await store.save(fixtureSnapshot(userID: "user_preview"))

        await store.clear()

        #expect(await store.load(userID: "user_preview") == nil)
    }

    @Test("Only bounded pages at the latest messages are carried, in priority order")
    func pageSelection() {
        let latest = ChatMessagePage(messages: HausPreviewFixtures.messages, nextBeforeSequence: nil, threads: [])
        let scrolledAway = ChatMessagePage(
            messages: HausPreviewFixtures.messages, nextBeforeSequence: nil, nextAfterSequence: 9, threads: []
        )
        let pages = ["a": latest, "b": scrolledAway, "c": latest, "d": latest, "e": latest]

        let kept = LaunchSnapshot.pages(pages, priority: ["b", "a", "missing", "c", "a", "d", "e"])

        #expect(Set(kept.keys) == ["a", "c", "d"])
    }

    private func fixtureSnapshot(userID: String) -> LaunchSnapshot {
        LaunchSnapshot(
            userID: userID,
            servers: [HausPreviewFixtures.server],
            chats: HausPreviewFixtures.chats,
            agents: HausPreviewFixtures.agents,
            members: HausPreviewFixtures.memberDirectory,
            pagesByChatID: [
                "chat_cove": ChatMessagePage(
                    messages: HausPreviewFixtures.messages,
                    nextBeforeSequence: nil,
                    threads: []
                ),
            ]
        )
    }

    private func temporaryFile() -> URL {
        FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
            .appendingPathComponent("launch-snapshot.json")
    }
}
