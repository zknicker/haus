import CoreGraphics
import Foundation
import ImageIO
import SwiftUI

/// A decoded, downsampled attachment image ready for display.
///
/// It carries the bitmap as well as the SwiftUI `Image` drawn from it: the
/// viewer zooms this picture inside a `UIImageView`, whose layer contents have
/// to be the decode itself for the GPU to resample it sharply.
struct AttachmentThumbnail {
    let bitmap: CGImage
    let image: Image
    let size: CGSize
    /// Classified once, here, from the bytes this decode already had in hand,
    /// so the viewer's first frame carries the right ground instead of opening
    /// on black and stepping to a checkerboard once its own decode lands.
    /// A staged local file has no viewer page, so it keeps the default.
    let backdrop: AttachmentImageBackdrop

    init(bitmap: CGImage, size: CGSize, backdrop: AttachmentImageBackdrop = .opaque) {
        self.bitmap = bitmap
        image = Image(decorative: bitmap, scale: 1, orientation: .up)
        self.size = size
        self.backdrop = backdrop
    }
}

/// An immutable decoded bitmap handed across executors. `CGImage` is
/// immutable; the wrapper exists only because the SDK does not declare it
/// `Sendable`.
///
/// The source's own pixel size travels beside the decode because every decode
/// here is downsampled to a display budget: a tile that sized itself from the
/// bitmap would read a 4032-pixel photograph as 480 pixels and shrink its box
/// to fit a picture that is not small at all. Only the source dimensions can
/// answer "is this image smaller than the box we would give it".
struct DecodedAttachmentBitmap: @unchecked Sendable {
    let cgImage: CGImage
    let sourcePixelWidth: Int
    let sourcePixelHeight: Int

    init(cgImage: CGImage, sourcePixelWidth: Int? = nil, sourcePixelHeight: Int? = nil) {
        self.cgImage = cgImage
        self.sourcePixelWidth = sourcePixelWidth ?? cgImage.width
        self.sourcePixelHeight = sourcePixelHeight ?? cgImage.height
    }

    var pixelCost: Int { cgImage.width * cgImage.height * 4 }
}

/// ImageIO thumbnailing shared by every attachment surface. The function is
/// nonisolated async so the decode always runs on the concurrent pool, never
/// the main actor.
enum AttachmentImageDecoder {
    static func decode(at url: URL, maxPixelSize: CGFloat) async -> DecodedAttachmentBitmap? {
        guard let source = CGImageSourceCreateWithURL(url as CFURL, nil) else { return nil }
        let options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceThumbnailMaxPixelSize: maxPixelSize,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceShouldCacheImmediately: true,
        ]
        guard let cgImage = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else {
            return nil
        }
        let sourceSize = sourcePixelSize(of: source)
        return DecodedAttachmentBitmap(
            cgImage: cgImage,
            sourcePixelWidth: sourceSize?.width,
            sourcePixelHeight: sourceSize?.height
        )
    }

    /// Read from the container's metadata rather than by decoding, so it costs
    /// nothing. The thumbnail is created with the EXIF transform applied, so a
    /// rotated source reports its dimensions the way the bitmap wears them.
    private static func sourcePixelSize(
        of source: CGImageSource
    ) -> (width: Int, height: Int)? {
        guard
            let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
            let width = properties[kCGImagePropertyPixelWidth] as? Int,
            let height = properties[kCGImagePropertyPixelHeight] as? Int
        else { return nil }
        let orientation = properties[kCGImagePropertyOrientation] as? Int ?? 1
        let isQuarterTurned = (5...8).contains(orientation)
        return isQuarterTurned ? (width: height, height: width) : (width: width, height: height)
    }
}

/// In-memory cache of decoded attachment thumbnails keyed by attachment id.
///
/// Sent attachments have no local file, so every inline image tile downloads
/// through the authenticated attachment route and decodes a downsampled
/// bitmap. This cache keeps re-renders and scrolling from re-downloading and
/// re-decoding the same attachment. Bounded by both entry count and decoded
/// pixel bytes so a long timeline of large photos cannot grow unbounded.
@MainActor
final class AttachmentImageCache {
    static let shared = AttachmentImageCache()

    private let cache = NSCache<NSString, ThumbnailBox>()
    /// Bumped by `removeAll()`. A decode captures it before its first await
    /// and hands it back to `store`, so one that began before a sign-out
    /// cannot repopulate the emptied cache.
    private(set) var generation = 0

    init() {
        cache.countLimit = 80
        cache.totalCostLimit = 64 * 1024 * 1024
    }

    func thumbnail(for attachmentID: String) -> AttachmentThumbnail? {
        cache.object(forKey: attachmentID as NSString)?.thumbnail
    }

    func store(
        _ thumbnail: AttachmentThumbnail,
        for attachmentID: String,
        decodedPixelCost: Int,
        stagedContentKey: String? = nil,
        loadedIn loadGeneration: Int? = nil
    ) {
        guard loadGeneration.map({ $0 == generation }) ?? true else { return }
        let box = ThumbnailBox(thumbnail: thumbnail, pixelCost: decodedPixelCost)
        cache.setObject(box, forKey: attachmentID as NSString, cost: decodedPixelCost)
        if let stagedContentKey {
            cache.setObject(box, forKey: stagedContentKey as NSString, cost: decodedPixelCost)
        }
    }

    /// A pending upload decodes from its staged local file under the composer
    /// attachment id, but the durable message arrives under a fresh Server
    /// attachment id with no local file. Matching on filename + byte size lets
    /// the retired row's replacement render the identical bitmap on its first
    /// frame instead of flashing the placeholder and re-downloading.
    func adoptStagedThumbnail(
        filename: String,
        sizeBytes: Int,
        as attachmentID: String
    ) -> AttachmentThumbnail? {
        let key = Self.stagedContentKey(filename: filename, sizeBytes: sizeBytes)
        guard let box = cache.object(forKey: key as NSString) else { return nil }
        cache.setObject(box, forKey: attachmentID as NSString, cost: box.pixelCost)
        return box.thumbnail
    }

    func removeAll() {
        generation += 1
        cache.removeAllObjects()
    }

    static func stagedContentKey(filename: String, sizeBytes: Int) -> String {
        "staged-content:\(sizeBytes):\(filename)"
    }

    private final class ThumbnailBox {
        let thumbnail: AttachmentThumbnail
        let pixelCost: Int

        init(thumbnail: AttachmentThumbnail, pixelCost: Int) {
            self.thumbnail = thumbnail
            self.pixelCost = pixelCost
        }
    }
}
