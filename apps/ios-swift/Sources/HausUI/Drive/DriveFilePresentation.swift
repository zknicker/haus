import Foundation
import HausModels

/// One Drive file as a row and its preview read it: the revision the listing
/// returned, and its author's name when the App can say it.
public struct DriveFilePresentation: Identifiable, Hashable, Sendable {
    public let record: ArtifactRecord
    public let authorName: String?

    public init(record: ArtifactRecord, authorName: String? = nil) {
        self.record = record
        self.authorName = authorName
    }

    public var id: String { record.id }
    public var metadata: SharedArtifactMetadata { record.metadata }
    public var filename: String { metadata.filename }

    /// The folder holding the file: `projects/product/duo-layouts.html` sits
    /// in `projects/product`.
    public var folder: String {
        guard let slash = metadata.path.lastIndex(of: "/") else { return "" }
        return String(metadata.path[..<slash])
    }

    /// `projects/product · Tiny · 20m`.
    public func metaPieces(now: Date) -> [String] {
        [folder.isEmpty ? nil : folder, authorName, HausCompactRelativeTime.label(for: metadata.updatedAt, now: now)]
            .compactMap { $0 }
    }

    public var revisionLabel: String { "Revision \(metadata.revisionNumber)" }

    public var preview: DriveFilePreviewChoice {
        DriveFilePreviewChoice(contentType: metadata.contentType, filename: metadata.filename)
    }
}

/// How a Drive file previews. HTML renders as a page on the sandboxed canvas
/// and plain text renders as text, both from `artifact.text`; everything else
/// downloads the revision and opens in the shared file preview.
public enum DriveFilePreviewChoice: Hashable, Sendable {
    case page
    case text(monospaced: Bool)
    case file

    public init(contentType: String, filename: String) {
        let kind = SharedArtifactFileKind(contentType: contentType, filename: filename)
        let type = contentType.split(separator: ";").first
            .map { $0.trimmingCharacters(in: .whitespaces).lowercased() } ?? ""
        let fileExtension = (filename as NSString).pathExtension.lowercased()
        switch kind {
        case .html:
            self = .page
        case .document where Self.isPlainText(type: type, fileExtension: fileExtension):
            self = .text(monospaced: !Self.proseExtensions.contains(fileExtension) && type != "text/markdown")
        default:
            self = .file
        }
    }

    /// Whether the choice reads the file through `artifact.text`.
    public var readsText: Bool { self != .file }

    private static func isPlainText(type: String, fileExtension: String) -> Bool {
        if type == "image/svg+xml" || fileExtension == "svg" { return false }
        return type.hasPrefix("text/") || textTypes.contains(type) || textExtensions.contains(fileExtension)
    }

    private static let proseExtensions: Set<String> = ["md", "markdown", "txt", "text"]
    private static let textTypes: Set<String> = [
        "application/json", "application/xml", "application/yaml", "application/x-yaml",
        "application/javascript", "application/typescript", "application/toml", "application/x-sh",
    ]
    private static let textExtensions: Set<String> = [
        "md", "markdown", "txt", "text", "json", "yaml", "yml", "toml", "xml", "csv", "log",
        "ts", "tsx", "js", "jsx", "mjs", "swift", "py", "rb", "go", "rs", "sh", "css", "sql",
    ]
}
