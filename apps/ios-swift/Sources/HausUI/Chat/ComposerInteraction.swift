import Observation
import SwiftUI

public enum ComposerOverlay: String, Identifiable {
    case sources
    case photos
    case camera

    public var id: String { rawValue }
}

@MainActor
@Observable
public final class ComposerInteraction {
    public var attachments: [ComposerAttachment] = []
    public var overlay: ComposerOverlay?
    public var isFileImporterPresented = false
    public var isPreparingAttachment = false
    public var errorMessage: String?
    public var morphingAttachmentID: String?
    public private(set) var attachmentReadySequence = 0
    public private(set) var lastReadyAttachmentCount = 0
    var morphDestinationFrame: CGRect?
    /// Composer shell rect in window coordinates, so the portal — which draws in a window of its
    /// own above the keyboard — can sit above it.
    var composerSurfaceFrame: CGRect?
    /// Holds the chat's bottom inset still while the portal owns the screen.
    var portalFreeze = ComposerPortalFreeze()

    private var preparationTask: Task<Void, Never>?

    public init() {}

    var remainingCapacity: Int { max(0, 20 - attachments.count) }

    func preparePhotoFiles(_ urls: [URL]) async -> [ComposerAttachment] {
        isPreparingAttachment = true
        defer { isPreparingAttachment = false }
        var prepared: [ComposerAttachment] = []
        for url in urls.prefix(remainingCapacity) {
            do {
                prepared.append(try ComposerAttachmentStager.stagePhoto(at: url))
            } catch {
                errorMessage = error.localizedDescription
            }
        }
        return prepared
    }

    func prepareCapturedPhoto(_ data: Data) -> ComposerAttachment? {
        do {
            return try ComposerAttachmentStager.stageCapturedPhoto(data)
        } catch {
            errorMessage = error.localizedDescription
            return nil
        }
    }

    func stageImportedFiles(_ urls: [URL]) {
        preparationTask?.cancel()
        preparationTask = Task { @MainActor in
            isPreparingAttachment = true
            defer { isPreparingAttachment = false }
            for url in urls.prefix(remainingCapacity) {
                guard !Task.isCancelled else { return }
                do {
                    appendPrepared([try ComposerAttachmentStager.stageImportedFile(at: url)])
                } catch {
                    errorMessage = error.localizedDescription
                }
            }
        }
    }

    func remove(_ attachment: ComposerAttachment) {
        attachments.removeAll { $0.id == attachment.id }
        ComposerAttachmentStager.remove(attachment)
    }

    func appendPrepared(_ prepared: [ComposerAttachment]) {
        guard !prepared.isEmpty else { return }
        // Warm the decoded-image cache so the strip tile, the morph, and the
        // pending message tile all render the photo fully formed on their
        // first frame.
        for attachment in prepared where attachment.mediaType.hasPrefix("image/") {
            LocalAttachmentImageCache.shared.warm(url: attachment.localURL)
        }
        attachments.append(contentsOf: prepared)
        lastReadyAttachmentCount = prepared.count
        attachmentReadySequence += 1
    }

    /// Drops everything the screen that drew the composer owned, and keeps
    /// everything the interaction owns.
    ///
    /// An interaction outlives its screen — the shell keeps one per destination
    /// so staged attachments survive a Chat switch or a push-over — but its
    /// presentation state does not: an open portal, a frozen keyboard inset, or
    /// an error notice belonging to a screen that is gone must not come back
    /// haunting the next one. Staged attachments and the in-flight staging task
    /// deliberately survive; a preparation cancelled halfway would leave the
    /// user with some of the files they picked.
    func resetPresentation() {
        overlay = nil
        isFileImporterPresented = false
        morphingAttachmentID = nil
        morphDestinationFrame = nil
        composerSurfaceFrame = nil
        errorMessage = nil
        portalFreeze.release()
    }

    /// Tears down all staged composer state. Deleting the staged files without
    /// also clearing `attachments` would leave tiles whose backing files are
    /// gone — they render fallback icons and the send fails — so the two must
    /// always move together. Only the owner discarding the whole interaction
    /// calls this — the shell, when a destination leaves the list. Leaving a
    /// screen does not: the files are the user's, and staging them is not a
    /// commitment to send from the Chat they were staged in.
    public func cleanUp() {
        preparationTask?.cancel()
        attachments.forEach(ComposerAttachmentStager.remove)
        attachments.removeAll()
    }
}
