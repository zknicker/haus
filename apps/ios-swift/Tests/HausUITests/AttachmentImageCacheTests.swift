import Foundation
@testable import HausUI
import Testing

@MainActor
struct AttachmentImageCacheTests {
    @Test func storesAndReturnsAThumbnailByAttachmentID() {
        let cache = AttachmentImageCache()
        let thumbnail = AttachmentThumbnail(bitmap: AttachmentBitmapFixture.bitmap(), size: .init(width: 240, height: 180))

        cache.store(thumbnail, for: "attachment-1", decodedPixelCost: 4)

        #expect(cache.thumbnail(for: "attachment-1") != nil)
        #expect(cache.thumbnail(for: "attachment-2") == nil)
    }

    /// The pending → sent bridge: a bitmap decoded for a staged local file is
    /// adoptable under the fresh Server attachment id via filename + size.
    @Test func adoptsAStagedThumbnailUnderTheServerAttachmentID() {
        let cache = AttachmentImageCache()
        let thumbnail = AttachmentThumbnail(bitmap: AttachmentBitmapFixture.bitmap(), size: .init(width: 180, height: 180))
        cache.store(
            thumbnail,
            for: "pending-attachment",
            decodedPixelCost: 4,
            stagedContentKey: AttachmentImageCache.stagedContentKey(filename: "Photo.jpg", sizeBytes: 1234)
        )

        let adopted = cache.adoptStagedThumbnail(filename: "Photo.jpg", sizeBytes: 1234, as: "server-attachment")

        #expect(adopted != nil)
        #expect(cache.thumbnail(for: "server-attachment") != nil)
    }

    @Test func refusesToAdoptWhenFilenameOrSizeDiffers() {
        let cache = AttachmentImageCache()
        let thumbnail = AttachmentThumbnail(bitmap: AttachmentBitmapFixture.bitmap(), size: .init(width: 180, height: 180))
        cache.store(
            thumbnail,
            for: "pending-attachment",
            decodedPixelCost: 4,
            stagedContentKey: AttachmentImageCache.stagedContentKey(filename: "Photo.jpg", sizeBytes: 1234)
        )

        #expect(cache.adoptStagedThumbnail(filename: "Photo.jpg", sizeBytes: 999, as: "a") == nil)
        #expect(cache.adoptStagedThumbnail(filename: "Other.jpg", sizeBytes: 1234, as: "b") == nil)
    }

    /// Sign-out: a decode that began before the wipe lands after it and must
    /// not put the previous account's picture back.
    @Test func removeAllEmptiesTheCacheAndRefusesADecodeFromBeforeIt() {
        let cache = AttachmentImageCache()
        let thumbnail = AttachmentThumbnail(bitmap: AttachmentBitmapFixture.bitmap(), size: .init(width: 180, height: 180))
        cache.store(
            thumbnail,
            for: "a",
            decodedPixelCost: 4,
            stagedContentKey: AttachmentImageCache.stagedContentKey(filename: "Photo.jpg", sizeBytes: 1234)
        )
        let staleGeneration = cache.generation

        cache.removeAll()
        cache.store(thumbnail, for: "late", decodedPixelCost: 4, loadedIn: staleGeneration)
        cache.store(thumbnail, for: "fresh", decodedPixelCost: 4, loadedIn: cache.generation)

        #expect(cache.thumbnail(for: "a") == nil)
        #expect(cache.adoptStagedThumbnail(filename: "Photo.jpg", sizeBytes: 1234, as: "b") == nil)
        #expect(cache.thumbnail(for: "late") == nil)
        #expect(cache.thumbnail(for: "fresh") != nil)
    }
}
