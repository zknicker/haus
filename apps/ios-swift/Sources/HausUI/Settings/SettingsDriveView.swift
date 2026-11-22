import HausModels
import SwiftUI

/// One Drive folder pushed from You: the browser over a listing read for its
/// prefix. Blank while it loads; a failed read offers Try again.
struct SettingsDriveView: View {
    let prefix: String
    let load: @Sendable (String) async throws -> DriveListing
    let onOpenFolder: (ArtifactFolderEntry) -> Void
    let onOpenFile: (DriveFilePresentation) -> Void

    @State private var listing: DriveListing?
    @State private var failure: String?
    @State private var attempt = 0

    var body: some View {
        DriveBrowserView(
            title: Self.title(prefix: prefix),
            listing: listing,
            onOpenFolder: onOpenFolder,
            onOpenFile: onOpenFile
        )
        .overlay {
            if listing == nil, let failure {
                ContentUnavailableView {
                    Label("Drive unavailable", systemImage: "exclamationmark.triangle")
                } description: {
                    Text(failure)
                } actions: {
                    Button("Try again") { attempt += 1 }
                }
            }
        }
        .task(id: attempt) { await read() }
        .refreshable { await read() }
    }

    private func read() async {
        do {
            listing = try await load(prefix)
            failure = nil
        } catch is CancellationError {
            return
        } catch {
            failure = error.localizedDescription
        }
    }

    /// The root reads "Drive"; a folder reads its last path segment.
    nonisolated static func title(prefix: String) -> String {
        let segments = prefix.split(separator: "/")
        return segments.last.map(String.init) ?? "Drive"
    }
}
