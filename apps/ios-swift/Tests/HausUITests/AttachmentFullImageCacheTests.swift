@testable import HausUI
import SwiftUI
import Testing

@MainActor
struct AttachmentFullImageCacheTests {
    @Test func storesAndReturnsADecodeByAttachmentID() {
        let cache = AttachmentFullImageCache()
        cache.store(full(cost: 16), for: "a")

        #expect(cache.image(for: "a") != nil)
        #expect(cache.image(for: "b") == nil)
    }

    @Test func keepsTheBackdropTheDecodeWasClassifiedWith() {
        let cache = AttachmentFullImageCache()
        cache.store(full(cost: 16, backdrop: .checkerboard(.light)), for: "a")

        #expect(cache.image(for: "a")?.backdrop == .checkerboard(.light))
    }

    @Test func evictsTheLeastRecentlyUsedPageOverTheCountLimit() {
        let cache = AttachmentFullImageCache(countLimit: 2, costLimit: .max)
        cache.store(full(cost: 1), for: "a")
        cache.store(full(cost: 1), for: "b")
        cache.store(full(cost: 1), for: "c")

        #expect(cache.count == 2)
        #expect(cache.image(for: "a") == nil)
        #expect(cache.image(for: "b") != nil)
        #expect(cache.image(for: "c") != nil)
    }

    /// Paging back is the reason the cache exists, so a page the reader
    /// returned to must outlast one they have not looked at since.
    @Test func aReadPageOutlivesAnUnreadOne() {
        let cache = AttachmentFullImageCache(countLimit: 2, costLimit: .max)
        cache.store(full(cost: 1), for: "a")
        cache.store(full(cost: 1), for: "b")
        _ = cache.image(for: "a")
        cache.store(full(cost: 1), for: "c")

        #expect(cache.image(for: "a") != nil)
        #expect(cache.image(for: "b") == nil)
    }

    @Test func evictsUntilTheDecodedBytesAreBackUnderTheCostLimit() {
        let cache = AttachmentFullImageCache(countLimit: .max, costLimit: 100)
        cache.store(full(cost: 40), for: "a")
        cache.store(full(cost: 40), for: "b")
        cache.store(full(cost: 40), for: "c")

        #expect(cache.totalCost <= 100)
        #expect(cache.image(for: "a") == nil)
        #expect(cache.image(for: "c") != nil)
    }

    /// The page being looked at has to survive its own insertion, whatever it
    /// cost, or an oversized image would evict itself and never draw.
    @Test func keepsTheNewestPageEvenWhenItAloneExceedsTheLimit() {
        let cache = AttachmentFullImageCache(countLimit: 4, costLimit: 100)
        cache.store(full(cost: 40), for: "a")
        cache.store(full(cost: 500), for: "huge")

        #expect(cache.count == 1)
        #expect(cache.image(for: "huge") != nil)
    }

    /// Sign-out: a decode that began before the wipe lands after it and must
    /// not put the previous account's picture back.
    @Test func removeAllEmptiesTheCacheAndRefusesADecodeFromBeforeIt() {
        let cache = AttachmentFullImageCache()
        cache.store(full(cost: 16), for: "a")
        let staleGeneration = cache.generation

        cache.removeAll()
        cache.store(full(cost: 16), for: "late", loadedIn: staleGeneration)
        cache.store(full(cost: 16), for: "fresh", loadedIn: cache.generation)

        #expect(cache.image(for: "a") == nil)
        #expect(cache.image(for: "late") == nil)
        #expect(cache.image(for: "fresh") != nil)
        #expect(cache.totalCost == 16)
    }

    @Test func replacingAPageDoesNotDoubleCountItsBytes() {
        let cache = AttachmentFullImageCache(countLimit: 4, costLimit: .max)
        cache.store(full(cost: 40), for: "a")
        cache.store(full(cost: 10), for: "a")

        #expect(cache.count == 1)
        #expect(cache.totalCost == 10)
    }

    /// What the cache gives back under memory pressure. Every page it drops can
    /// be decoded again from bytes already on disk.
    @Test func dropsEverythingOnDemand() {
        let cache = AttachmentFullImageCache()
        cache.store(full(cost: 40), for: "a")
        cache.store(full(cost: 40), for: "b")

        cache.removeAll()

        #expect(cache.count == 0)
        #expect(cache.totalCost == 0)
        #expect(cache.image(for: "a") == nil)
    }

    private func full(
        cost: Int,
        backdrop: AttachmentImageBackdrop = .opaque
    ) -> AttachmentFullImage {
        AttachmentFullImage(
            bitmap: AttachmentBitmapFixture.bitmap(),
            backdrop: backdrop,
            pixelCost: cost
        )
    }
}
