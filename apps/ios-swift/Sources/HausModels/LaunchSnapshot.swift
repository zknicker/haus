import Foundation

/// The last Server state this device rendered, kept on disk so a cold launch
/// paints immediately while the live load runs. It is a cache, never a source
/// of truth: the live load replaces every field it carries.
///
/// Scoped to one signed-in user and one Server. A snapshot written by another
/// user, or in another format version, is discarded rather than migrated.
public struct LaunchSnapshot: Codable, Sendable, Equatable {
    /// Bump whenever a carried model's encoding changes shape.
    public static let currentVersion = 1
    /// Pages beyond this many messages are not worth a cold-launch paint.
    public static let maximumPageMessages = 200
    public static let maximumPages = 3

    public let version: Int
    public let userID: String
    public let servers: [ServerSummary]
    public let chats: [ChatSummary]
    public let agents: [AgentSummary]
    public let members: MemberList?
    public let pagesByChatID: [String: ChatMessagePage]
    /// The Inbox's week strip. Optional, so a snapshot written before it was
    /// carried still decodes; without it the strip popped in a beat after the
    /// cold-launch paint and shoved the page down.
    public let serverUsage: ServerUsageSnapshot?

    public var serverID: String? { servers.first?.id }

    public init(
        userID: String,
        servers: [ServerSummary],
        chats: [ChatSummary],
        agents: [AgentSummary],
        members: MemberList?,
        pagesByChatID: [String: ChatMessagePage],
        serverUsage: ServerUsageSnapshot? = nil
    ) {
        version = Self.currentVersion
        self.userID = userID
        self.servers = servers
        self.chats = chats
        self.agents = agents
        self.members = members
        self.pagesByChatID = pagesByChatID
        self.serverUsage = serverUsage
    }

    /// The pages worth carrying: the given Chats in priority order, skipping
    /// any that is missing, scrolled away from the latest messages, or large.
    public static func pages(
        _ pages: [String: ChatMessagePage],
        priority chatIDs: [String]
    ) -> [String: ChatMessagePage] {
        var kept: [String: ChatMessagePage] = [:]
        for chatID in chatIDs where kept[chatID] == nil {
            guard kept.count < maximumPages else { break }
            guard let page = pages[chatID],
                  page.nextAfterSequence == nil,
                  page.messages.count <= maximumPageMessages
            else { continue }
            kept[chatID] = page
        }
        return kept
    }
}

/// Serialized, off-main access to the launch snapshot file.
public actor LaunchSnapshotStore {
    private struct Header: Decodable {
        let version: Int
        let userID: String
    }

    public let fileURL: URL

    public init(fileURL: URL) {
        self.fileURL = fileURL
    }

    /// `Application Support/Haus/launch-snapshot.json`. Application Support
    /// rather than Caches so storage pressure cannot purge the cold-launch
    /// paint; `save` excludes the directory from device backups instead.
    public static func applicationSupport() -> LaunchSnapshotStore {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? FileManager.default.temporaryDirectory
        return LaunchSnapshotStore(
            fileURL: base.appendingPathComponent("Haus", isDirectory: true)
                .appendingPathComponent("launch-snapshot.json", isDirectory: false)
        )
    }

    /// The snapshot for this user, or nil. A file this build cannot read — an
    /// older version, another user, or a corrupt write — is deleted.
    public func load(userID: String) -> LaunchSnapshot? {
        guard let data = try? Data(contentsOf: fileURL) else { return nil }
        let decoder = HausJSON.decoder()
        guard let header = try? decoder.decode(Header.self, from: data),
              header.version == LaunchSnapshot.currentVersion,
              header.userID == userID,
              let snapshot = try? decoder.decode(LaunchSnapshot.self, from: data)
        else {
            clear()
            return nil
        }
        return snapshot
    }

    public func save(_ snapshot: LaunchSnapshot) throws {
        let data = try HausJSON.encoder().encode(snapshot)
        var directory = fileURL.deletingLastPathComponent()
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        // Message pages and the member directory (emails included) are a
        // device-local cache; they must not ride along in iCloud or Finder
        // backups. Set on the directory, it survives each atomic replace.
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        try directory.setResourceValues(values)
        try data.write(to: fileURL, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    }

    public func clear() {
        try? FileManager.default.removeItem(at: fileURL)
    }
}
