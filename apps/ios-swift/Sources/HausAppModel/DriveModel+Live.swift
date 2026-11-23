import Foundation
import HausModels
import OSLog

/// Keeping held Drive reads current from `artifact.onUpdated`.
extension DriveModel {
    /// A stream start, or the coalesced pass after an update: re-reads the
    /// browsed folder and each place's recent files, and on a start every
    /// open file preview too.
    public func recover(_ projections: Set<RealtimeProjection>) async {
        let readsListings = projections.contains(.driveListings)
        let query = readsListings ? listing?.query : nil
        let folders = readsListings ? recentByFolder.keys.sorted() : []
        let paths = projections.contains(.driveFiles) ? Self.paths(in: fileByPath, changedArtifact: nil) : []
        await withTaskGroup(of: Void.self) { group in
            if let query {
                group.addTask { await self.logged { try await self.show(query) } }
            }
            for folder in folders {
                group.addTask { await self.logged { try await self.loadRecent(folder: folder) } }
            }
            for path in paths {
                group.addTask { await self.logged { try await self.loadFile(path: path) } }
            }
        }
    }

    /// `artifact.onUpdated`: re-reads the open previews of the file it
    /// names at once, or of every open file for a null id (a folder move or a
    /// batch).
    public func refreshFiles(changedArtifact artifactID: String?) async {
        let paths = Self.paths(in: fileByPath, changedArtifact: artifactID)
        await withTaskGroup(of: Void.self) { group in
            for path in paths {
                group.addTask { await self.logged { try await self.loadFile(path: path) } }
            }
        }
    }

    /// The open previews an update reaches.
    nonisolated static func paths(in files: [String: ArtifactRecord], changedArtifact artifactID: String?) -> [String] {
        guard let artifactID else { return files.keys.sorted() }
        return files.filter { $0.value.metadata.artifactID == artifactID }.keys.sorted()
    }

    private func logged(_ read: () async throws -> Void) async {
        do {
            try await read()
        } catch is CancellationError {
            return
        } catch {
            Self.logger.error("Refreshing Drive failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    static let logger = Logger(subsystem: "chat.haus.ios", category: "drive")
}
