import HausModels
import SwiftUI

/// A Drive file in a plain list: its kind's glyph, the file name, then
/// `projects/product · Tiny · 20m`.
struct DriveFileRow: View {
    let file: DriveFilePresentation
    let now: Date

    var body: some View {
        WorkListRow(title: file.filename) {
            HausIcon(file.metadata.fileKind.glyph, size: 16)
                .foregroundStyle(HausPlatformColor.mutedInk)
        } meta: {
            WorkMetaLine(pieces: file.metaPieces(now: now))
        }
    }
}

/// A Drive folder in a plain list: its name, then how many files it holds and
/// when one last changed.
struct DriveFolderRow: View {
    let folder: ArtifactFolderEntry
    let now: Date

    var body: some View {
        WorkListRow(title: folder.name) {
            HausIcon(.folder, size: 16)
                .foregroundStyle(HausPlatformColor.mutedInk)
        } meta: {
            WorkMetaLine(pieces: [
                "\(folder.fileCount) \(folder.fileCount == 1 ? "file" : "files")",
                HausCompactRelativeTime.label(for: folder.updatedAt, now: now),
            ])
        }
    }
}

/// Tappable Drive file rows.
struct DriveFileRows: View {
    let files: [DriveFilePresentation]
    let now: Date
    let onOpen: (DriveFilePresentation) -> Void

    var body: some View {
        ForEach(files) { file in
            Button {
                onOpen(file)
            } label: {
                DriveFileRow(file: file, now: now)
            }
            .buttonStyle(.pressableRow)
        }
    }
}
