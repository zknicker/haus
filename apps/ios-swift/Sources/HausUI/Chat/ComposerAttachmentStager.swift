import CoreTransferable
import Foundation
import UniformTypeIdentifiers

struct ComposerPhotoFile: Transferable {
    let url: URL

    static var transferRepresentation: some TransferRepresentation {
        FileRepresentation(importedContentType: .image) { received in
            let fileExtension = received.file.pathExtension.isEmpty ? "jpg" : received.file.pathExtension
            let directory = FileManager.default.temporaryDirectory
                .appendingPathComponent("HausPhotoImports", isDirectory: true)
                .appendingPathComponent(UUID().uuidString, isDirectory: true)
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            let destination = directory.appendingPathComponent("Photo.\(fileExtension)")
            try FileManager.default.copyItem(at: received.file, to: destination)
            return ComposerPhotoFile(url: destination)
        }
    }
}

public enum ComposerAttachmentStager {
    static let maximumSize = 50 * 1_024 * 1_024

    static func stagePhoto(at sourceURL: URL) throws -> ComposerAttachment {
        let values = try sourceURL.resourceValues(forKeys: [.contentTypeKey, .fileSizeKey])
        defer { try? FileManager.default.removeItem(at: sourceURL.deletingLastPathComponent()) }
        return try stageFile(
            at: sourceURL,
            filename: sourceURL.lastPathComponent,
            contentType: values.contentType ?? .image,
            sizeHint: values.fileSize ?? 0
        )
    }

    static func stageImportedFile(at sourceURL: URL) throws -> ComposerAttachment {
        let accessing = sourceURL.startAccessingSecurityScopedResource()
        defer { if accessing { sourceURL.stopAccessingSecurityScopedResource() } }
        let values = try sourceURL.resourceValues(forKeys: [.contentTypeKey, .fileSizeKey])
        return try stageFile(
            at: sourceURL,
            filename: sourceURL.lastPathComponent,
            contentType: values.contentType ?? .data,
            sizeHint: values.fileSize ?? 0
        )
    }

    static func stageCapturedPhoto(_ data: Data) throws -> ComposerAttachment {
        try validateSize(data.count)
        let directory = try makeAttachmentDirectory()
        let localURL = directory.appendingPathComponent("Photo.jpg")
        do {
            try data.write(to: localURL, options: .atomic)
            return ComposerAttachment(
                filename: "Photo.jpg",
                mediaType: UTType.jpeg.preferredMIMEType ?? "image/jpeg",
                sizeBytes: data.count,
                localURL: localURL
            )
        } catch {
            try? FileManager.default.removeItem(at: directory)
            throw error
        }
    }

    public static func remove(_ attachment: ComposerAttachment) {
        try? FileManager.default.removeItem(at: attachment.localURL.deletingLastPathComponent())
    }

    static func validateSize(_ size: Int) throws {
        guard size <= maximumSize else { throw ComposerAttachmentPreparationError.tooLarge }
    }

    static func sanitizedFilename(_ filename: String) -> String {
        let invalid = CharacterSet.controlCharacters.union(CharacterSet(charactersIn: "/\\"))
        let sanitized = filename.components(separatedBy: invalid).joined(separator: "-")
        let trimmed = sanitized.trimmingCharacters(in: .whitespacesAndNewlines)
        return String((trimmed.isEmpty ? "Attachment" : trimmed).prefix(255))
    }

    private static func stageFile(
        at sourceURL: URL,
        filename: String,
        contentType: UTType,
        sizeHint: Int
    ) throws -> ComposerAttachment {
        if sizeHint > 0 { try validateSize(sizeHint) }
        let safeFilename = sanitizedFilename(filename)
        let directory = try makeAttachmentDirectory()
        let localURL = directory.appendingPathComponent(safeFilename)
        do {
            try FileManager.default.copyItem(at: sourceURL, to: localURL)
            let copiedSize = try localURL.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
            try validateSize(copiedSize)
            return ComposerAttachment(
                filename: safeFilename,
                mediaType: contentType.preferredMIMEType ?? "application/octet-stream",
                sizeBytes: copiedSize,
                localURL: localURL
            )
        } catch {
            try? FileManager.default.removeItem(at: directory)
            throw error
        }
    }

    private static func makeAttachmentDirectory() throws -> URL {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("HausComposer", isDirectory: true)
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        return directory
    }
}

enum ComposerAttachmentPreparationError: LocalizedError {
    case tooLarge
    case unreadable

    var errorDescription: String? {
        switch self {
        case .tooLarge: "Attachments must be 50 MiB or smaller."
        case .unreadable: "That attachment could not be read."
        }
    }
}
