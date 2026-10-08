import SwiftUI

/// The box an inline image draws in: a message's single image gets the hero
/// tile sized from the picture, and two or more share the strip's uniform
/// squares.
enum AttachmentImageTileBox: Equatable {
    case hero
    case square(CGFloat)

    func size(for thumbnail: AttachmentThumbnail?) -> CGSize {
        switch self {
        case .hero:
            thumbnail?.size ?? AttachmentImageTileSize.placeholderSize
        case .square(let side):
            CGSize(width: side, height: side)
        }
    }
}

/// Renders an image attachment as an inline media tile instead of a file row.
///
/// Sent attachments download through the authenticated `onOpen` closure (the
/// same path Quick Look uses); pending attachments decode straight from their
/// staged local file. Every decode is downsampled off the main actor and
/// cached in `AttachmentImageCache`, and `body` reads the cache synchronously,
/// so a cached tile — including one recycled by a lazy stack — renders fully
/// formed on its first frame. Reports failure so the caller can fall back to
/// the standard file row.
struct AttachmentImageTile: View {
    let attachment: MessageAttachmentPresentation
    let onOpen: (MessageAttachmentPresentation) async throws -> URL
    let onFailure: () -> Void
    var box: AttachmentImageTileBox = .hero
    /// Where this tile publishes its UIView so the screen's image viewer can
    /// grow out of it and fall back into it. Nil for a pending upload, which
    /// has no viewer page.
    var tiles: AttachmentImageTileRegistry?

    /// The landed decode, held as state `body` renders from. SwiftUI
    /// invalidates a view only for state its body actually reads, so the
    /// async landing must arrive through the rendered value itself — a
    /// side-channel marker the body never reads leaves a finished decode
    /// painted as the placeholder forever. The cache read below is the
    /// recycled-view fast path, not the invalidation.
    @State private var loaded: LoadedAttachmentThumbnail?
    /// The hero box is the image's native point size, so the tile has to know
    /// how many pixels a point is worth.
    @Environment(\.displayScale) private var displayScale

    var body: some View {
        let thumbnail = loaded?.thumbnail(for: attachment.id)
            ?? Self.cachedThumbnail(for: attachment, scale: displayScale)
        let needsLoad = thumbnail == nil
        let size = box.size(for: thumbnail)
        ZStack {
            // The grid arrives with the bitmap and never on its own: the
            // classification is stored beside the decode, so a recycled tile
            // reads both synchronously and a first decode brings both at once.
            // There is no frame on which a transparent image is painted
            // without its ground.
            if let thumbnail {
                checkerboard(thumbnail.backdrop)
                thumbnail.image
                    .resizable()
                    .aspectRatio(contentMode: .fill)
            } else {
                Rectangle().fill(.quaternary)
            }
        }
        .frame(width: size.width, height: size.height)
        .clipShape(.haus(AttachmentImageTileSize.cornerRadius))
        .overlay { zoomAnchor }
        .task(id: attachment.id) {
            guard needsLoad else { return }
            await loadThumbnail()
        }
    }

    @ViewBuilder
    private func checkerboard(_ backdrop: AttachmentImageBackdrop) -> some View {
        #if os(iOS)
        if case .checkerboard(let tone) = backdrop {
            AttachmentImageCheckerboard(
                tone: tone,
                square: AttachmentImageCheckerboard.thumbnailSquare
            )
        }
        #endif
    }

    @ViewBuilder
    private var zoomAnchor: some View {
        #if os(iOS)
        if let tiles {
            AttachmentImageTileAnchor(attachmentID: attachment.id, registry: tiles)
                .allowsHitTesting(false)
        }
        #endif
    }

    /// Resolves a renderable thumbnail without leaving the main actor: the
    /// tile's own cache entry first, then the staged-file cache for pending
    /// attachments, then the staged-content bridge that lets a just-sent
    /// attachment reuse the bitmap its pending row already decoded.
    @MainActor
    static func cachedThumbnail(
        for attachment: MessageAttachmentPresentation,
        scale: CGFloat
    ) -> AttachmentThumbnail? {
        if let hit = AttachmentImageCache.shared.thumbnail(for: attachment.id) { return hit }
        if let localURL = attachment.localURL {
            guard let entry = LocalAttachmentImageCache.shared.entry(for: localURL) else { return nil }
            let thumbnail = AttachmentThumbnail(
                bitmap: entry.bitmap,
                size: AttachmentImageTileSize.fitted(
                    pixelWidth: entry.pixelWidth,
                    pixelHeight: entry.pixelHeight,
                    scale: scale
                ),
                backdrop: entry.backdrop
            )
            AttachmentImageCache.shared.store(
                thumbnail,
                for: attachment.id,
                // The staged entry reports the file's own pixel size, which the
                // box is measured against; what the cache holds is the
                // downsampled decode, and that is what its budget counts.
                decodedPixelCost: entry.bitmap.width * entry.bitmap.height * 4,
                stagedContentKey: AttachmentImageCache.stagedContentKey(
                    filename: attachment.filename,
                    sizeBytes: attachment.sizeBytes
                )
            )
            return thumbnail
        }
        return AttachmentImageCache.shared.adoptStagedThumbnail(
            filename: attachment.filename,
            sizeBytes: attachment.sizeBytes,
            as: attachment.id
        )
    }

    @MainActor
    private func loadThumbnail() async {
        if let localURL = attachment.localURL {
            guard await LocalAttachmentImageCache.shared.load(url: localURL) != nil,
                  // Promotes the staged entry into AttachmentImageCache.
                  let thumbnail = Self.cachedThumbnail(for: attachment, scale: displayScale)
            else {
                onFailure()
                return
            }
            loaded = LoadedAttachmentThumbnail(attachmentID: attachment.id, thumbnail: thumbnail)
            return
        }
        let loadGeneration = AttachmentImageCache.shared.generation
        do {
            // The resolved file is owned by the caller's attachment cache and
            // must survive this decode: Quick Look opens the same bytes, and
            // the next cold launch draws this tile from them instead of
            // downloading the attachment again.
            let url = try await onOpen(attachment)
            guard
                let bitmap = await AttachmentImageDecoder.decode(
                    at: url,
                    maxPixelSize: AttachmentImageTileSize.maxWidth * 2
                )
            else {
                onFailure()
                return
            }
            // Classified off the main actor, beside the decode, because the
            // viewer needs the answer on the frame it opens, the tile needs it
            // on the frame it paints, and this is the only place these pixels
            // are already in hand.
            let backdrop = await AttachmentImageBackdrop.classified(bitmap)
            let thumbnail = AttachmentThumbnail(
                bitmap: bitmap.cgImage,
                size: AttachmentImageTileSize.fitted(
                    pixelWidth: bitmap.sourcePixelWidth,
                    pixelHeight: bitmap.sourcePixelHeight,
                    scale: displayScale
                ),
                backdrop: backdrop
            )
            AttachmentImageCache.shared.store(
                thumbnail,
                for: attachment.id,
                decodedPixelCost: bitmap.pixelCost,
                loadedIn: loadGeneration
            )
            loaded = LoadedAttachmentThumbnail(attachmentID: attachment.id, thumbnail: thumbnail)
        } catch is CancellationError {
            // The tile disappeared or the transfer was superseded; no error UI needed.
        } catch {
            onFailure()
        }
    }
}

/// One landed decode pinned to the attachment it belongs to, so a recycled
/// tile whose attachment changed cannot render the previous image.
private struct LoadedAttachmentThumbnail {
    let attachmentID: String
    let thumbnail: AttachmentThumbnail

    func thumbnail(for id: String) -> AttachmentThumbnail? {
        attachmentID == id ? thumbnail : nil
    }
}
