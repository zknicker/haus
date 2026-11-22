import Foundation
import Testing
@testable import HausModels

@Suite("Launch snapshot")
struct LaunchSnapshotTests {
    private let protocolVersion = 13
    private let serverID = HausPreviewFixtures.server.id

    @Test("A saved snapshot reads back identically for the same user and Server")
    func roundTrip() async throws {
        let store = makeStore()
        let snapshot = fixtureSnapshot(userID: "user_preview")

        try await store.save(snapshot)
        let loaded = await store.load(userID: "user_preview", serverID: serverID)

        #expect(loaded == snapshot)
        #expect(loaded?.serverID == serverID)
    }

    @Test("Each Server keeps its own file, and loading one never paints another")
    func perServerFiles() async throws {
        let store = makeStore()
        try await store.save(fixtureSnapshot(userID: "user_preview"))
        try await store.save(fixtureSnapshot(userID: "user_preview", serverID: "srv_other"))

        #expect(await store.load(userID: "user_preview", serverID: "srv_other")?.serverID == "srv_other")
        #expect(await store.load(userID: "user_preview", serverID: serverID)?.serverID == serverID)
        #expect(await store.load(userID: "user_preview", serverID: "srv_missing") == nil)
    }

    @Test("A file whose recorded Server does not match its name is discarded")
    func mismatchedServerIsDiscarded() async throws {
        let store = makeStore()
        try await store.save(fixtureSnapshot(userID: "user_preview"))
        let data = try Data(contentsOf: store.fileURL(serverID: serverID))
        try data.write(to: store.fileURL(serverID: "srv_other"))

        #expect(await store.load(userID: "user_preview", serverID: "srv_other") == nil)
        #expect(!FileManager.default.fileExists(atPath: store.fileURL(serverID: "srv_other").path))
    }

    @Test("Another user's snapshot is never painted, and is deleted")
    func otherUserIsDiscarded() async throws {
        let store = makeStore()
        try await store.save(fixtureSnapshot(userID: "user_a"))

        #expect(await store.load(userID: "user_b", serverID: serverID) == nil)
        #expect(!FileManager.default.fileExists(atPath: store.fileURL(serverID: serverID).path))
    }

    @Test("A different format version or a corrupt file is discarded")
    func versionMismatchIsDiscarded() async throws {
        let store = makeStore()
        let url = store.fileURL(serverID: serverID)
        try await store.save(fixtureSnapshot(userID: "user_preview"))
        try rewrite(store) { $0["version"] = LaunchSnapshot.currentVersion - 1 }

        #expect(await store.load(userID: "user_preview", serverID: serverID) == nil)
        #expect(!FileManager.default.fileExists(atPath: url.path))

        try Data("{not json".utf8).write(to: url)
        #expect(await store.load(userID: "user_preview", serverID: serverID) == nil)
        #expect(!FileManager.default.fileExists(atPath: url.path))
    }

    @Test("A snapshot written under another App protocol, or none, is discarded")
    func protocolMismatchIsDiscarded() async throws {
        let directory = temporaryDirectory()
        let older = LaunchSnapshotStore(directoryURL: directory, appProtocolVersion: protocolVersion - 1)
        try await older.save(fixtureSnapshot(userID: "user_preview", appProtocolVersion: protocolVersion - 1))

        let current = LaunchSnapshotStore(directoryURL: directory, appProtocolVersion: protocolVersion)
        #expect(await current.load(userID: "user_preview", serverID: serverID) == nil)

        try await current.save(fixtureSnapshot(userID: "user_preview"))
        try rewrite(current) { $0.removeValue(forKey: "appProtocolVersion") }
        #expect(await current.load(userID: "user_preview", serverID: serverID) == nil)
    }

    @Test("The single-file snapshot an earlier build wrote is deleted, never painted")
    func legacyFileIsMigrated() async throws {
        let base = temporaryDirectory()
        let legacy = base.appendingPathComponent("launch-snapshot.json")
        try FileManager.default.createDirectory(at: base, withIntermediateDirectories: true)
        try Data("{\"version\":3}".utf8).write(to: legacy)
        let store = LaunchSnapshotStore(
            directoryURL: base.appendingPathComponent("launch-snapshots"),
            appProtocolVersion: protocolVersion,
            legacyFileURLs: [legacy]
        )

        #expect(await store.load(userID: "user_preview", serverID: serverID) == nil)
        #expect(!FileManager.default.fileExists(atPath: legacy.path))
    }

    @Test("The snapshot directory is excluded from device backups")
    func excludedFromBackup() async throws {
        let store = makeStore()
        try await store.save(fixtureSnapshot(userID: "user_preview"))
        try await store.save(fixtureSnapshot(userID: "user_preview"))

        let values = try store.directoryURL.resourceValues(forKeys: [.isExcludedFromBackupKey])
        #expect(values.isExcludedFromBackup == true)
    }

    @Test("Clearing one Server keeps the others; clearing all leaves nothing to paint")
    func clearing() async throws {
        let store = makeStore()
        try await store.save(fixtureSnapshot(userID: "user_preview"))
        try await store.save(fixtureSnapshot(userID: "user_preview", serverID: "srv_other"))

        await store.clear(serverID: "srv_other")
        #expect(await store.load(userID: "user_preview", serverID: "srv_other") == nil)
        #expect(await store.load(userID: "user_preview", serverID: serverID) != nil)

        await store.clearAll()
        #expect(await store.load(userID: "user_preview", serverID: serverID) == nil)
    }

    @Test("Only bounded pages at the latest messages are carried, in priority order")
    func pageSelection() {
        let latest = ChatMessagePage(messages: HausPreviewFixtures.messages, nextBeforeSequence: nil)
        let scrolledAway = ChatMessagePage(
            messages: HausPreviewFixtures.messages, nextBeforeSequence: nil, nextAfterSequence: 9
        )
        let pages = ["a": latest, "b": scrolledAway, "c": latest, "d": latest, "e": latest]

        let kept = LaunchSnapshot.pages(pages, priority: ["b", "a", "missing", "c", "a", "d", "e"])

        #expect(Set(kept.keys) == ["a", "c", "d"])
    }

    private func makeStore() -> LaunchSnapshotStore {
        LaunchSnapshotStore(directoryURL: temporaryDirectory(), appProtocolVersion: protocolVersion)
    }

    private func rewrite(_ store: LaunchSnapshotStore, _ edit: (inout [String: Any]) -> Void) throws {
        let url = store.fileURL(serverID: serverID)
        var object = try #require(JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any])
        edit(&object)
        try JSONSerialization.data(withJSONObject: object).write(to: url)
    }

    private func fixtureSnapshot(
        userID: String,
        serverID: String? = nil,
        appProtocolVersion: Int? = nil
    ) -> LaunchSnapshot {
        LaunchSnapshot(
            appProtocolVersion: appProtocolVersion ?? protocolVersion,
            userID: userID,
            serverID: serverID ?? self.serverID,
            servers: [HausPreviewFixtures.server],
            chats: HausPreviewFixtures.chats,
            agents: HausPreviewFixtures.agents,
            members: HausPreviewFixtures.memberDirectory,
            pagesByChatID: [
                "chat_blippy": ChatMessagePage(
                    messages: HausPreviewFixtures.messages,
                    nextBeforeSequence: nil,
                ),
            ],
        )
    }

    private func temporaryDirectory() -> URL {
        FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
    }
}
