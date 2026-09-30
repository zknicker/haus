import CoreGraphics
import Foundation
@testable import HausUI
import ImageIO
import Testing
import UniformTypeIdentifiers

@MainActor
struct LocalAttachmentImageCacheTests {
    @Test func decodesAStagedImageAndKeepsItForSynchronousReuse() async throws {
        let cache = LocalAttachmentImageCache()
        let url = try Self.writeOnePixelPNG()
        defer { try? FileManager.default.removeItem(at: url.deletingLastPathComponent()) }

        let loaded = await cache.load(url: url)

        #expect(loaded != nil)
        #expect(loaded?.pixelWidth == 1)
        #expect(loaded?.pixelHeight == 1)
        // A cache hit must resolve synchronously so the first frame renders
        // the image with no async hop.
        #expect(cache.entry(for: url) != nil)
    }

    /// A staged file is decoded before its pending row lays out, so the tile
    /// sizes itself from the picture the person actually picked and the row
    /// never reflows when the sent message replaces it.
    @Test func reportsAStagedFilesOwnPixelSizeAndItsTransparency() async throws {
        let cache = LocalAttachmentImageCache()
        let url = try Self.writePNG(width: 384, height: 256, transparent: true)
        defer { try? FileManager.default.removeItem(at: url.deletingLastPathComponent()) }

        let entry = try #require(await cache.load(url: url))

        #expect(entry.pixelWidth == 384)
        #expect(entry.pixelHeight == 256)
        #expect(entry.backdrop == .checkerboard(.light))
        let box = AttachmentImageTileSize.fitted(
            pixelWidth: entry.pixelWidth,
            pixelHeight: entry.pixelHeight,
            scale: 3
        )
        #expect(box != AttachmentImageTileSize.placeholderSize)
        #expect(box == CGSize(width: 128, height: 96))
    }

    /// Every decode here is downsampled to a display budget, so the box has to
    /// be measured against the source rather than the bitmap — otherwise a
    /// photograph reads as a small image and shrinks its own tile.
    @Test func carriesTheSourcePixelSizeThroughADownsampledDecode() async throws {
        let url = try Self.writePNG(width: 384, height: 256, transparent: false)
        defer { try? FileManager.default.removeItem(at: url.deletingLastPathComponent()) }

        let bitmap = try #require(await AttachmentImageDecoder.decode(at: url, maxPixelSize: 64))

        #expect(bitmap.cgImage.width == 64)
        #expect(bitmap.sourcePixelWidth == 384)
        #expect(bitmap.sourcePixelHeight == 256)
    }

    @Test func removeAllForgetsEveryStagedDecode() async throws {
        let cache = LocalAttachmentImageCache()
        let url = try Self.writeOnePixelPNG()
        defer { try? FileManager.default.removeItem(at: url.deletingLastPathComponent()) }
        #expect(await cache.load(url: url) != nil)

        cache.removeAll()

        #expect(cache.entry(for: url) == nil)
        #expect(await cache.load(url: url) != nil)
    }

    @Test func returnsNilForAMissingFile() async {
        let cache = LocalAttachmentImageCache()
        let missing = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString)
            .appendingPathComponent("gone.jpg")

        let loaded = await cache.load(url: missing)

        #expect(loaded == nil)
        #expect(cache.entry(for: missing) == nil)
    }

    private static func writeOnePixelPNG() throws -> URL {
        let url = try emptyFile(named: "pixel.png")
        let data = try #require(Data(base64Encoded: Self.onePixelPNG))
        try data.write(to: url)
        return url
    }

    /// A black rectangle with one transparent quadrant: dark artwork with real
    /// transparency, which is the pale grid's case.
    private static func writePNG(width: Int, height: Int, transparent: Bool) throws -> URL {
        let context = try #require(
            CGContext(
                data: nil,
                width: width,
                height: height,
                bitsPerComponent: 8,
                bytesPerRow: width * 4,
                space: CGColorSpaceCreateDeviceRGB(),
                bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
            )
        )
        context.setFillColor(CGColor(red: 0, green: 0, blue: 0, alpha: 1))
        context.fill(
            CGRect(
                x: 0,
                y: 0,
                width: transparent ? width / 2 : width,
                height: transparent ? height / 2 : height
            )
        )
        let image = try #require(context.makeImage())
        let url = try emptyFile(named: "staged.png")
        let destination = try #require(
            CGImageDestinationCreateWithURL(url as CFURL, UTType.png.identifier as CFString, 1, nil)
        )
        CGImageDestinationAddImage(destination, image, nil)
        #expect(CGImageDestinationFinalize(destination))
        return url
    }

    private static func emptyFile(named name: String) throws -> URL {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        return directory.appendingPathComponent(name)
    }

    private static let onePixelPNG =
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
}
