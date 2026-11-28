import Foundation
@testable import HausUI
import Testing

@MainActor
struct ComposerInteractionStoreTests {
    /// The canvas is remounted per Chat, so the store — not the screen — is what
    /// makes a staged photo still be there when the user comes back.
    @Test func keepsOneInteractionPerDestination() {
        let store = ComposerInteractionStore()
        let general = ChatDestination.ID.chat("general")
        let agent = ChatDestination.ID.captain("blippy")

        #expect(store.interaction(for: general) === store.interaction(for: general))
        #expect(store.interaction(for: general) !== store.interaction(for: agent))
        #expect(store.count == 2)
    }

    @Test func droppingADestinationDeletesItsStagedFiles() throws {
        let store = ComposerInteractionStore()
        let leaving = ChatDestination.ID.chat("archived")
        let staying = ChatDestination.ID.chat("general")
        let discarded = try Self.stageTemporaryFile(named: "leaving.txt")
        let kept = try Self.stageTemporaryFile(named: "staying.txt")
        store.interaction(for: leaving).appendPrepared([discarded])
        store.interaction(for: staying).appendPrepared([kept])

        store.dropInteractions(outside: [staying])

        #expect(store.count == 1)
        #expect(!FileManager.default.fileExists(atPath: discarded.localURL.path))
        #expect(store.interaction(for: staying).attachments.map(\.id) == [kept.id])
        #expect(FileManager.default.fileExists(atPath: kept.localURL.path))
        // A dropped destination comes back empty rather than carrying dead tiles.
        #expect(store.interaction(for: leaving).attachments.isEmpty)

        store.dropInteractions(outside: [])
        store.interaction(for: staying).cleanUp()
    }

    /// A momentarily empty Chat list is a reconnect, not every Chat being
    /// deleted at once; discarding staged files there would lose real work.
    @Test func anEmptyDestinationListDropsNothing() throws {
        let store = ComposerInteractionStore()
        let general = ChatDestination.ID.chat("general")
        let staged = try Self.stageTemporaryFile(named: "notes.txt")
        store.interaction(for: general).appendPrepared([staged])

        store.dropInteractions(outside: [])

        #expect(store.count == 1)
        #expect(store.interaction(for: general).attachments.map(\.id) == [staged.id])
        #expect(FileManager.default.fileExists(atPath: staged.localURL.path))

        store.interaction(for: general).cleanUp()
    }

    private static func stageTemporaryFile(named filename: String) throws -> ComposerAttachment {
        let sourceDirectory = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: sourceDirectory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: sourceDirectory) }
        let source = sourceDirectory.appendingPathComponent(filename)
        try Data("hello".utf8).write(to: source)
        return try ComposerAttachmentStager.stageImportedFile(at: source)
    }
}
