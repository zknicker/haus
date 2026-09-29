import Foundation
import XCTest
@testable import HausTransport

final class AttachmentFileCacheTests: XCTestCase {
    func testKeysAnAttachmentByServerAndIDAndKeepsItsDisplayFilename() throws {
        let root = URL(fileURLWithPath: "/caches/HausAttachments", isDirectory: true)

        let url = try XCTUnwrap(AttachmentFileCache.fileURL(
            root: root,
            serverID: "srv_1",
            attachmentID: "att_1",
            displayFilename: "Quarterly Plan.pdf"
        ))

        XCTAssertEqual(
            url.path,
            "/caches/HausAttachments/srv_1/att_1/Quarterly Plan.pdf"
        )
    }

    func testRejectsIdentifiersThatCannotBePathComponents() {
        for identifier in ["..", "", "a/b"] {
            XCTAssertNil(AttachmentFileCache.fileURL(
                root: URL(fileURLWithPath: "/caches", isDirectory: true),
                serverID: identifier,
                attachmentID: "att_1",
                displayFilename: "file.png"
            ))
            XCTAssertNil(AttachmentFileCache.fileURL(
                root: URL(fileURLWithPath: "/caches", isDirectory: true),
                serverID: "srv_1",
                attachmentID: identifier,
                displayFilename: "file.png"
            ))
        }
    }

    func testADisplayFilenameCannotEscapeItsAttachmentDirectory() throws {
        let url = try XCTUnwrap(AttachmentFileCache.fileURL(
            root: URL(fileURLWithPath: "/caches", isDirectory: true),
            serverID: "srv_1",
            attachmentID: "att_1",
            displayFilename: "../../etc/passwd"
        ))

        XCTAssertEqual(url.path, "/caches/srv_1/att_1/passwd")
    }

    func testKeepsEverythingThatFitsTheBudget() {
        let entries = [
            entry("a", sizeBytes: 40, minutesAgo: 1),
            entry("b", sizeBytes: 40, minutesAgo: 2),
        ]

        XCTAssertEqual(AttachmentFileCache.evictions(entries, budgetBytes: 100), [])
    }

    func testEvictsTheLeastRecentlyUsedAttachmentsPastTheBudget() {
        let entries = [
            entry("oldest", sizeBytes: 40, minutesAgo: 30),
            entry("newest", sizeBytes: 40, minutesAgo: 1),
            entry("middle", sizeBytes: 40, minutesAgo: 10),
        ]

        let evicted = AttachmentFileCache.evictions(entries, budgetBytes: 100)

        XCTAssertEqual(evicted.map(\.lastPathComponent), ["oldest"])
    }

    func testEvictsEverythingOlderThanTheEntryThatSpentTheBudget() {
        let entries = [
            entry("newest", sizeBytes: 90, minutesAgo: 1),
            entry("large", sizeBytes: 40, minutesAgo: 5),
            entry("small", sizeBytes: 1, minutesAgo: 10),
        ]

        let evicted = AttachmentFileCache.evictions(entries, budgetBytes: 100)

        XCTAssertEqual(evicted.map(\.lastPathComponent), ["large", "small"])
    }

    func testReadsSizeAndRecencyFromDisk() throws {
        let root = try makeRoot()
        let file = root
            .appendingPathComponent("srv_1", isDirectory: true)
            .appendingPathComponent("att_1", isDirectory: true)
            .appendingPathComponent("note.txt", isDirectory: false)
        try FileManager.default.createDirectory(
            at: file.deletingLastPathComponent(),
            withIntermediateDirectories: true
        )
        try Data("hello".utf8).write(to: file)

        let entries = AttachmentFileCache.entries(root: root)

        XCTAssertEqual(entries.count, 1)
        XCTAssertEqual(entries.first?.sizeBytes, 5)
        XCTAssertEqual(entries.first?.directory.lastPathComponent, "att_1")
    }

    func testACacheHitReturnsTheStoredFileWithoutDownloadingAgain() async throws {
        let root = try makeRoot()
        let cache = AttachmentFileCache(root: root)
        let downloads = DownloadCount()

        let first = try await cache.file(
            serverID: "srv_1",
            attachmentID: "att_1",
            displayFilename: "photo.png"
        ) {
            await downloads.increment()
            return try AttachmentFileCacheTests.stageDownload(named: "photo.png")
        }
        let second = try await cache.file(
            serverID: "srv_1",
            attachmentID: "att_1",
            displayFilename: "photo.png"
        ) {
            await downloads.increment()
            return try AttachmentFileCacheTests.stageDownload(named: "photo.png")
        }

        XCTAssertEqual(first, second)
        XCTAssertEqual(first.lastPathComponent, "photo.png")
        XCTAssertEqual(try Data(contentsOf: second), Data("attachment".utf8))
        let count = await downloads.value
        XCTAssertEqual(count, 1)
    }

    func testRemoveAllDropsEveryCachedAttachmentSoTheNextOpenDownloads() async throws {
        let root = try makeRoot()
        let cache = AttachmentFileCache(root: root)
        let downloads = DownloadCount()
        let open = {
            try await cache.file(
                serverID: "srv_1",
                attachmentID: "att_1",
                displayFilename: "photo.png"
            ) {
                await downloads.increment()
                return try AttachmentFileCacheTests.stageDownload(named: "photo.png")
            }
        }

        let cached = try await open()
        try await cache.removeAll()

        XCTAssertFalse(FileManager.default.fileExists(atPath: cached.path))
        XCTAssertTrue(AttachmentFileCache.entries(root: root).isEmpty)
        _ = try await open()
        let count = await downloads.value
        XCTAssertEqual(count, 2)
    }

    func testConcurrentOpensOfTheSameAttachmentShareOneDownload() async throws {
        let root = try makeRoot()
        let cache = AttachmentFileCache(root: root)
        let downloads = DownloadCount()

        async let first = cache.file(
            serverID: "srv_1",
            attachmentID: "att_1",
            displayFilename: "photo.png"
        ) {
            await downloads.increment()
            await Task.yield()
            return try AttachmentFileCacheTests.stageDownload(named: "photo.png")
        }
        async let second = cache.file(
            serverID: "srv_1",
            attachmentID: "att_1",
            displayFilename: "photo.png"
        ) {
            await downloads.increment()
            return try AttachmentFileCacheTests.stageDownload(named: "photo.png")
        }

        let urls = try await (first, second)

        XCTAssertEqual(urls.0, urls.1)
        let count = await downloads.value
        XCTAssertEqual(count, 1)
    }

    func testAHitBumpsRecencySoTrimmingEvictsTheAttachmentNobodyOpened() async throws {
        let root = try makeRoot()
        let cache = AttachmentFileCache(root: root)
        let opened = try await cache.file(
            serverID: "srv_1",
            attachmentID: "opened",
            displayFilename: "a.bin"
        ) { try AttachmentFileCacheTests.stageDownload(named: "a.bin") }
        let ignored = try await cache.file(
            serverID: "srv_1",
            attachmentID: "ignored",
            displayFilename: "b.bin"
        ) { try AttachmentFileCacheTests.stageDownload(named: "b.bin") }
        _ = try await cache.file(
            serverID: "srv_1",
            attachmentID: "opened",
            displayFilename: "a.bin"
        ) {
            XCTFail("A cache hit must not download")
            return opened
        }

        // Both files are 10 bytes, so a 10-byte budget holds exactly one and
        // the reopened attachment has to be the survivor.
        await AttachmentFileCache(root: root, budgetBytes: 10).trim()

        XCTAssertTrue(FileManager.default.fileExists(atPath: opened.path))
        XCTAssertFalse(FileManager.default.fileExists(atPath: ignored.path))
    }

    func testRejectsAnAttachmentIdentifierThatIsNotAPathComponent() async throws {
        let cache = AttachmentFileCache(root: try makeRoot())

        do {
            _ = try await cache.file(
                serverID: "srv_1",
                attachmentID: "../escape",
                displayFilename: "a.bin"
            ) { XCTFail("An invalid identifier must not download"); return URL(fileURLWithPath: "/") }
            XCTFail("Expected an invalid identifier error")
        } catch {
            XCTAssertEqual(error as? AttachmentTransferError, .invalidIdentifier)
        }
    }

    private func entry(_ name: String, sizeBytes: Int, minutesAgo: Int) -> AttachmentCacheEntry {
        AttachmentCacheEntry(
            directory: URL(fileURLWithPath: "/caches/srv_1", isDirectory: true)
                .appendingPathComponent(name, isDirectory: true),
            sizeBytes: sizeBytes,
            usedAt: Date(timeIntervalSince1970: 1_000_000 - Double(minutesAgo) * 60)
        )
    }

    private func makeRoot() throws -> URL {
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent("AttachmentFileCacheTests", isDirectory: true)
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        addTeardownBlock { try? FileManager.default.removeItem(at: root) }
        return root
    }

    /// Mirrors the transport's contract: a finished download in its own
    /// randomized temporary directory, which the cache takes ownership of.
    private static func stageDownload(named filename: String) throws -> URL {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("HausAttachments", isDirectory: true)
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let url = directory.appendingPathComponent(filename, isDirectory: false)
        try Data("attachment".utf8).write(to: url)
        return url
    }
}

private actor DownloadCount {
    private(set) var value = 0
    func increment() { value += 1 }
}
