import Foundation

/// One cached attachment: the directory that holds it, its size on disk, and
/// when it was last used.
public struct AttachmentCacheEntry: Equatable, Sendable {
    public let directory: URL
    public let sizeBytes: Int
    public let usedAt: Date

    public init(directory: URL, sizeBytes: Int, usedAt: Date) {
        self.directory = directory
        self.sizeBytes = sizeBytes
        self.usedAt = usedAt
    }
}

/// Disk cache for downloaded attachment bytes, keyed by Server and attachment id.
///
/// A Server attachment is an immutable record: the bytes behind
/// `(serverID, attachmentID)` never change, which is the license to answer a
/// repeat open from disk without revalidating. Without it every Quick Look
/// open re-downloaded the file, and every cold launch re-downloaded every
/// visible image attachment in full just to draw its thumbnail.
///
/// The URL this cache returns is cache-owned: consumers must never delete it
/// or its directory. Eviction belongs to `trim()` and to the system, which may
/// purge Caches wholesale — a purge only costs the next open one download.
public actor AttachmentFileCache {
    /// A single attachment reaches 50 MiB, so the budget has to hold a real
    /// working set of them rather than a handful of thumbnails.
    public static let defaultBudgetBytes = 256 * 1024 * 1024

    public static var defaultRoot: URL {
        let caches = FileManager.default
            .urls(for: .cachesDirectory, in: .userDomainMask)
            .first ?? FileManager.default.temporaryDirectory
        return caches.appendingPathComponent("HausAttachments", isDirectory: true)
    }

    private let root: URL
    private let budgetBytes: Int
    private var loads: [String: Task<URL, Error>] = [:]

    public init(
        root: URL = AttachmentFileCache.defaultRoot,
        budgetBytes: Int = AttachmentFileCache.defaultBudgetBytes
    ) {
        self.root = root
        self.budgetBytes = budgetBytes
    }

    /// Returns the attachment's bytes on disk, downloading them once if they
    /// are missing.
    ///
    /// Concurrent callers for the same attachment share one download, and a
    /// partially written file is never observable at the cache path: `download`
    /// writes into its own temporary directory and the finished file is moved
    /// into place.
    public func file(
        serverID: String,
        attachmentID: String,
        displayFilename: String,
        download: @Sendable @escaping () async throws -> URL
    ) async throws -> URL {
        guard let destination = Self.fileURL(
            root: root,
            serverID: serverID,
            attachmentID: attachmentID,
            displayFilename: displayFilename
        ) else {
            throw AttachmentTransferError.invalidIdentifier
        }

        if touch(destination) { return destination }

        let key = destination.deletingLastPathComponent().path
        let task: Task<URL, Error>
        if let active = loads[key] {
            task = active
        } else {
            task = Task { [weak self] in
                let downloaded = try await download()
                // removeAll() cancels in-flight loads; a download that
                // finishes afterwards must not repopulate the emptied cache.
                try Task.checkCancellation()
                guard let self else { return downloaded }
                return try await self.insert(downloaded, at: destination)
            }
            loads[key] = task
        }
        defer { loads[key] = nil }
        return try await task.value
    }

    /// Deletes every cached attachment. Sign-out calls this so the next
    /// account on this device cannot open the previous one's files.
    public func removeAll() throws {
        for load in loads.values { load.cancel() }
        loads.removeAll()
        let manager = FileManager.default
        guard manager.fileExists(atPath: root.path) else { return }
        try manager.removeItem(at: root)
    }

    /// Evicts least-recently-used attachments until the cache fits its budget.
    public func trim() {
        for directory in Self.evictions(Self.entries(root: root), budgetBytes: budgetBytes) {
            try? FileManager.default.removeItem(at: directory)
        }
    }

    /// Cached attachments live one directory per attachment under their Server,
    /// with the sanitized display filename inside: Quick Look derives an
    /// attachment's title and type from the file's own name, so the name has to
    /// survive caching. Returns nil for an identifier that cannot be a path
    /// component.
    public static func fileURL(
        root: URL,
        serverID: String,
        attachmentID: String,
        displayFilename: String
    ) -> URL? {
        guard isSafeAttachmentPathComponent(serverID),
              isSafeAttachmentPathComponent(attachmentID)
        else { return nil }
        return root
            .appendingPathComponent(serverID, isDirectory: true)
            .appendingPathComponent(attachmentID, isDirectory: true)
            .appendingPathComponent(safeAttachmentFilename(displayFilename), isDirectory: false)
    }

    /// Newest first, keep while the running total fits, evict the rest. Once
    /// the budget is spent every older entry goes, so a run of small files
    /// cannot jump ahead of the large one that pushed past the limit.
    public static func evictions(_ entries: [AttachmentCacheEntry], budgetBytes: Int) -> [URL] {
        var kept = 0
        var evicted: [URL] = []
        for entry in entries.sorted(by: { $0.usedAt > $1.usedAt }) {
            kept += entry.sizeBytes
            if kept > budgetBytes { evicted.append(entry.directory) }
        }
        return evicted
    }

    /// Reads what is currently on disk. Recency is the newest modification
    /// date inside an attachment's directory, which `file(_:)` stamps on every
    /// hit.
    public static func entries(root: URL) -> [AttachmentCacheEntry] {
        let manager = FileManager.default
        guard let servers = try? manager.contentsOfDirectory(
            at: root,
            includingPropertiesForKeys: nil
        ) else { return [] }

        return servers.flatMap { server -> [AttachmentCacheEntry] in
            let attachments = (try? manager.contentsOfDirectory(
                at: server,
                includingPropertiesForKeys: nil
            )) ?? []
            return attachments.map(entry(forAttachmentDirectory:))
        }
    }

    private static func entry(forAttachmentDirectory directory: URL) -> AttachmentCacheEntry {
        let files = (try? FileManager.default.contentsOfDirectory(
            at: directory,
            includingPropertiesForKeys: [.fileSizeKey, .contentModificationDateKey]
        )) ?? []
        var sizeBytes = 0
        var usedAt = Date.distantPast
        for file in files {
            guard let values = try? file.resourceValues(
                forKeys: [.fileSizeKey, .contentModificationDateKey]
            ) else { continue }
            sizeBytes += values.fileSize ?? 0
            if let modified = values.contentModificationDate, modified > usedAt {
                usedAt = modified
            }
        }
        return AttachmentCacheEntry(directory: directory, sizeBytes: sizeBytes, usedAt: usedAt)
    }

    private func insert(_ downloaded: URL, at destination: URL) throws -> URL {
        let manager = FileManager.default
        let directory = destination.deletingLastPathComponent()
        // A record whose display filename changed must not bill two copies to
        // one key, so the attachment's directory is replaced wholesale.
        try? manager.removeItem(at: directory)
        try manager.createDirectory(at: directory, withIntermediateDirectories: true)
        do {
            try manager.moveItem(at: downloaded, to: destination)
        } catch {
            try? manager.removeItem(at: directory)
            throw AttachmentTransferError.transport(error.localizedDescription)
        }
        // The transport downloads into a temp directory it hands to the caller;
        // taking ownership of the file means retiring that directory too.
        try? manager.removeItem(at: downloaded.deletingLastPathComponent())
        _ = touch(destination)
        // Trimming is filesystem work the open is not waiting on; it runs on
        // this actor after the caller already has its file.
        Task { self.trim() }
        return destination
    }

    /// A hit has to move the entry to the front of the queue, or trimming would
    /// evict exactly the attachments people keep reopening.
    private func touch(_ url: URL) -> Bool {
        let manager = FileManager.default
        guard manager.fileExists(atPath: url.path) else { return false }
        try? manager.setAttributes([.modificationDate: Date()], ofItemAtPath: url.path)
        return true
    }
}
