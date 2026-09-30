#if os(iOS)
import Foundation
import SwiftUI
import UIKit

/// One open image viewer: the pages it can reach, the page it is on, and how a
/// page's bytes are resolved.
///
/// The SwiftUI viewer and the UIKit presenter both hold this. That is the whole
/// point of it: the zoom transition asks for its source view again at dismissal
/// time, and after a swipe the honest answer is the tile of the image now on
/// screen, not the tile that was tapped.
@MainActor
@Observable
final class AttachmentImageViewerSession {
    let pages: [MessageAttachmentPresentation]
    var currentIndex: Int

    @ObservationIgnored private let tiles: AttachmentImageTileRegistry
    @ObservationIgnored private let open: (MessageAttachmentPresentation) async throws -> URL
    @ObservationIgnored private let decodePixelSize: CGFloat
    @ObservationIgnored private var fileURLs: [String: URL] = [:]
    @ObservationIgnored private var inFlight: Set<String> = []
    @ObservationIgnored private var zoom = AttachmentImageZoomClaim()

    init(
        pages: [MessageAttachmentPresentation],
        startIndex: Int,
        tiles: AttachmentImageTileRegistry,
        decodePixelSize: CGFloat,
        open: @escaping (MessageAttachmentPresentation) async throws -> URL
    ) {
        self.pages = pages
        currentIndex = startIndex
        self.tiles = tiles
        self.decodePixelSize = decodePixelSize
        self.open = open
    }

    var current: MessageAttachmentPresentation? {
        pages.indices.contains(currentIndex) ? pages[currentIndex] : nil
    }

    /// The tile the card should collapse into. Nil when that row has scrolled
    /// away or been recycled, which the system answers with a fade.
    func sourceView() -> UIView? {
        guard let current else { return nil }
        return tiles.view(for: current.id)
    }

    /// Whether the page on screen is zoomed past its fit.
    ///
    /// The transition asks this before starting an interactive dismissal: a pan
    /// on a zoomed image is a pan across the image, and a card that flew away
    /// under it would be the viewer taking the reader's gesture. Deliberately
    /// outside observation — the zoom scroll view writes it during layout, and
    /// nothing renders from it.
    var isZoomed: Bool { zoom.isZoomed }

    func setZoomed(_ zoomed: Bool, for attachmentID: String) {
        zoom.set(zoomed, for: attachmentID)
    }

    /// What the share sheet is handed. Usually already resolved by the page's
    /// own load; a share tapped before that lands waits for the same resolve
    /// rather than leaving the control inert. The URL belongs to the attachment
    /// cache and outlives the viewer, so nothing here deletes it.
    func shareURL(for attachment: MessageAttachmentPresentation) async -> URL? {
        try? await resolve(attachment)
    }

    /// The bitmap already on screen behind this page — the tile's own decode,
    /// read synchronously so the viewer's very first frame carries the image
    /// rather than a blank pane waiting on a loader.
    func thumbnail(for attachment: MessageAttachmentPresentation) -> AttachmentThumbnail? {
        AttachmentImageCache.shared.thumbnail(for: attachment.id)
    }

    func fullImage(for attachment: MessageAttachmentPresentation) -> AttachmentFullImage? {
        AttachmentFullImageCache.shared.image(for: attachment.id)
    }

    @discardableResult
    func load(_ attachment: MessageAttachmentPresentation) async -> AttachmentFullImage? {
        if let cached = fullImage(for: attachment) { return cached }
        let loadGeneration = AttachmentFullImageCache.shared.generation
        do {
            let url = try await resolve(attachment)
            guard let bitmap = await AttachmentImageDecoder.decode(
                at: url,
                maxPixelSize: decodePixelSize
            ) else { return nil }
            let backdrop = await AttachmentImageBackdrop.classified(bitmap)
            let full = AttachmentFullImage(
                bitmap: bitmap.cgImage,
                backdrop: backdrop,
                pixelCost: bitmap.pixelCost
            )
            AttachmentFullImageCache.shared.store(full, for: attachment.id, loadedIn: loadGeneration)
            return full
        } catch {
            // The tile stays on screen behind the failure; a page that cannot
            // reach its bytes keeps showing the thumbnail it opened with.
            return nil
        }
    }

    /// Warms the pages either side of the current one so a swipe lands on a
    /// finished decode instead of a crossfade.
    func prefetchNeighbours() {
        for offset in [-1, 1] {
            let index = currentIndex + offset
            guard pages.indices.contains(index) else { continue }
            let attachment = pages[index]
            guard fullImage(for: attachment) == nil, !inFlight.contains(attachment.id) else {
                continue
            }
            inFlight.insert(attachment.id)
            Task { [weak self] in
                guard let self else { return }
                await load(attachment)
                inFlight.remove(attachment.id)
            }
        }
    }

    private func resolve(_ attachment: MessageAttachmentPresentation) async throws -> URL {
        if let known = fileURLs[attachment.id] { return known }
        let url = try await open(attachment)
        fileURLs[attachment.id] = url
        return url
    }
}
#endif
