import CoreGraphics
import Foundation
import ImageIO

/// Immutable ImageIO output passed back to the UI actor.
struct DecodedAvatarBitmap: @unchecked Sendable {
    let image: CGImage
    var pixelCost: Int { image.bytesPerRow * image.height }
}

enum AvatarImageDecoder {
    // Covers the 84pt profile avatar at 3x, with room for larger presentation.
    static let maxPixelSize = 384

    static func decode(_ data: Data) async -> DecodedAvatarBitmap? {
        decodeCachedBytes(data)
    }

    /// Also used by the synchronous recovery of a previously displayed avatar.
    static func decodeCachedBytes(_ data: Data) -> DecodedAvatarBitmap? {
        guard let source = CGImageSourceCreateWithData(
            data as CFData, [kCGImageSourceShouldCache: false] as CFDictionary
        ) else { return nil }
        let options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceThumbnailMaxPixelSize: maxPixelSize,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceShouldCacheImmediately: true,
        ]
        guard let image = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else {
            return nil
        }
        return DecodedAvatarBitmap(image: image)
    }
}
