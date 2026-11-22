import HausModels
import SwiftUI

/// One `artifact.list` page as the browser lists it: the folder's child
/// folders, then its files.
public struct DriveListing: Hashable, Sendable {
    public let folders: [ArtifactFolderEntry]
    public let files: [DriveFilePresentation]

    public init(folders: [ArtifactFolderEntry], files: [DriveFilePresentation]) {
        self.folders = folders
        self.files = files
    }

    /// Folders and files grouped by Drive area, folders first within an area.
    public var sections: [DriveAreaSection<DriveListingItem>] {
        DriveAreaSection.group(folders.map(DriveListingItem.folder) + files.map(DriveListingItem.file), path: \.path)
    }

    public var isEmpty: Bool { folders.isEmpty && files.isEmpty }
}

public enum DriveListingItem: Identifiable, Hashable, Sendable {
    case folder(ArtifactFolderEntry)
    case file(DriveFilePresentation)

    public var id: String {
        switch self {
        case .folder(let folder): "folder:\(folder.path)"
        case .file(let file): "file:\(file.id)"
        }
    }

    public var path: String {
        switch self {
        case .folder(let folder): folder.path
        case .file(let file): file.metadata.path
        }
    }
}

/// Browses Drive: a folder's listing grouped into `haus/`, `projects/<key>/`,
/// and `agents/<handle>/` sections. Blank while the listing loads; an empty
/// state only once it has loaded with nothing in it.
public struct DriveBrowserView: View {
    private let title: String
    private let listing: DriveListing?
    private let onOpenFolder: (ArtifactFolderEntry) -> Void
    private let onOpenFile: (DriveFilePresentation) -> Void

    public init(
        title: String,
        listing: DriveListing?,
        onOpenFolder: @escaping (ArtifactFolderEntry) -> Void,
        onOpenFile: @escaping (DriveFilePresentation) -> Void
    ) {
        self.title = title
        self.listing = listing
        self.onOpenFolder = onOpenFolder
        self.onOpenFile = onOpenFile
    }

    public var body: some View {
        content
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(HausPlatformColor.canvas)
            .navigationTitle(title)
            .hausInlineNavigationTitle()
    }

    @ViewBuilder
    private var content: some View {
        if let listing {
            if listing.isEmpty {
                ContentUnavailableView("No files", systemImage: "folder")
            } else {
                TimelineView(.periodic(from: .now, by: 60)) { context in
                    ScrollView {
                        LazyVStack(alignment: .leading, spacing: 0) {
                            ForEach(listing.sections, id: \.title) { section in
                                WorkListSection(section.title, count: nil) {
                                    ForEach(section.items) { item in
                                        row(item, now: context.date)
                                    }
                                }
                            }
                        }
                        .padding(.horizontal, 20)
                        .padding(.bottom, 24)
                    }
                }
            }
        }
    }

    @ViewBuilder
    private func row(_ item: DriveListingItem, now: Date) -> some View {
        switch item {
        case .folder(let folder):
            Button {
                onOpenFolder(folder)
            } label: {
                DriveFolderRow(folder: folder, now: now)
            }
            .buttonStyle(.pressableRow)
        case .file(let file):
            Button {
                onOpenFile(file)
            } label: {
                DriveFileRow(file: file, now: now)
            }
            .buttonStyle(.pressableRow)
        }
    }
}
