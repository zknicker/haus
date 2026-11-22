import Foundation

/// Serialized, off-main access to the launch snapshot files, one per Server.
public actor LaunchSnapshotStore {
    private struct Header: Decodable {
        let version: Int
        let appProtocolVersion: Int?
        let userID: String
        let serverID: String?
    }

    public nonisolated let directoryURL: URL
    public nonisolated let appProtocolVersion: Int
    /// Files an earlier build wrote. They predate the per-Server key, so the
    /// first access deletes them rather than painting another Server's state.
    private let legacyFileURLs: [URL]
    private var removedLegacyFiles = false

    public init(directoryURL: URL, appProtocolVersion: Int, legacyFileURLs: [URL] = []) {
        self.directoryURL = directoryURL
        self.appProtocolVersion = appProtocolVersion
        self.legacyFileURLs = legacyFileURLs
    }

    /// `Application Support/Haus/launch-snapshots/`. Application Support
    /// rather than Caches so storage pressure cannot purge the cold-launch
    /// paint; `save` excludes the directory from device backups instead.
    public static func applicationSupport(appProtocolVersion: Int) -> LaunchSnapshotStore {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? FileManager.default.temporaryDirectory
        let haus = base.appendingPathComponent("Haus", isDirectory: true)
        return LaunchSnapshotStore(
            directoryURL: haus.appendingPathComponent("launch-snapshots", isDirectory: true),
            appProtocolVersion: appProtocolVersion,
            legacyFileURLs: [haus.appendingPathComponent("launch-snapshot.json", isDirectory: false)]
        )
    }

    public nonisolated func fileURL(serverID: String) -> URL {
        let name = serverID.addingPercentEncoding(withAllowedCharacters: Self.fileNameCharacters) ?? serverID
        return directoryURL.appendingPathComponent("\(name).json", isDirectory: false)
    }

    /// The snapshot this user last saw on this Server, or nil. A file this
    /// build cannot read, or one written for another user or Server, is
    /// deleted rather than painted.
    public func load(userID: String, serverID: String) -> LaunchSnapshot? {
        removeLegacyFiles()
        let url = fileURL(serverID: serverID)
        guard let data = try? Data(contentsOf: url) else { return nil }
        let decoder = HausJSON.decoder()
        guard let header = try? decoder.decode(Header.self, from: data),
              header.version == LaunchSnapshot.currentVersion,
              header.appProtocolVersion == appProtocolVersion,
              header.userID == userID,
              header.serverID == serverID,
              let snapshot = try? decoder.decode(LaunchSnapshot.self, from: data)
        else {
            try? FileManager.default.removeItem(at: url)
            return nil
        }
        return snapshot
    }

    public func save(_ snapshot: LaunchSnapshot) throws {
        removeLegacyFiles()
        let data = try HausJSON.encoder().encode(snapshot)
        var directory = directoryURL
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        // Message pages and the member directory (emails included) are a
        // device-local cache; they must not ride along in iCloud or Finder
        // backups. Set on the directory, it survives each atomic replace.
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        try directory.setResourceValues(values)
        try data.write(
            to: fileURL(serverID: snapshot.serverID),
            options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication]
        )
    }

    /// Membership loss: that Server's paint goes, the others stay.
    public func clear(serverID: String) {
        try? FileManager.default.removeItem(at: fileURL(serverID: serverID))
    }

    /// Sign-out: nothing of this account may paint the next one's launch.
    public func clearAll() {
        removeLegacyFiles()
        try? FileManager.default.removeItem(at: directoryURL)
    }

    private func removeLegacyFiles() {
        guard !removedLegacyFiles else { return }
        removedLegacyFiles = true
        for url in legacyFileURLs {
            try? FileManager.default.removeItem(at: url)
        }
    }

    private static let fileNameCharacters = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "-_"))
}
