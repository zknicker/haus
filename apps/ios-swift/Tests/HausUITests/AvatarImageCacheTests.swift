import Foundation
import Testing
@testable import HausUI

@MainActor
struct AvatarImageCacheTests {
    @Test func ignoresAnOldAvatarThatFinishesAfterTheDestinationChanges() throws {
        let oldURL = try #require(URL(string: "https://example.com/old.png"))
        let newURL = try #require(URL(string: "https://example.com/new.png"))
        var state = AvatarImageLoadState<String>()

        state.begin(url: oldURL)
        state.begin(url: newURL)
        state.complete(value: "new", for: newURL, isCancelled: false)
        state.complete(value: "old", for: oldURL, isCancelled: false)

        #expect(state.value(for: newURL) == "new")
    }

    @Test func keepsDownloadedAvatarReadyForSynchronousReuse() async throws {
        let cache = AvatarImageCache()
        let url = try #require(URL(string: "https://example.com/avatar.png"))
        let imageData = try #require(Data(base64Encoded: Self.onePixelPNG))
        let fetchCount = FetchCount()

        let loaded = await cache.load(url: url) { _ in
            await fetchCount.increment()
            return imageData
        }

        #expect(loaded != nil)
        #expect(cache.image(for: url) != nil)
        _ = await cache.load(url: url) { _ in
            await fetchCount.increment()
            return imageData
        }
        #expect(await fetchCount.value == 1)
    }

    @Test func coalescesConcurrentLoadsForTheSameAvatar() async throws {
        let cache = AvatarImageCache()
        let url = try #require(URL(string: "https://example.com/avatar.png"))
        let imageData = try #require(Data(base64Encoded: Self.onePixelPNG))
        let fetchCount = FetchCount()

        async let first = cache.load(url: url) { _ in
            await fetchCount.increment()
            await Task.yield()
            return imageData
        }
        async let second = cache.load(url: url) { _ in
            await fetchCount.increment()
            return imageData
        }

        let results = await (first, second)
        #expect(results.0 != nil)
        #expect(results.1 != nil)
        #expect(await fetchCount.value == 1)
    }

    @Test func removeAllDropsEveryCachedAvatarSoTheNextLoadDownloads() async throws {
        let cache = AvatarImageCache()
        let url = try #require(URL(string: "https://example.com/avatar.png"))
        let imageData = try #require(Data(base64Encoded: Self.onePixelPNG))
        let fetchCount = FetchCount()
        let load = {
            await cache.load(url: url) { _ in
                await fetchCount.increment()
                return imageData
            }
        }

        #expect(await load() != nil)
        cache.removeAll()

        #expect(cache.image(for: url) == nil)
        #expect(await load() != nil)
        #expect(await fetchCount.value == 2)
    }

    @Test func removeAllStopsAnInFlightLoadFromRepopulatingTheCache() async throws {
        let cache = AvatarImageCache()
        let url = try #require(URL(string: "https://example.com/avatar.png"))
        let imageData = try #require(Data(base64Encoded: Self.onePixelPNG))
        let (started, markStarted) = AsyncStream<Void>.makeStream()
        let release = FetchGate()

        let pending = Task {
            await cache.load(url: url) { _ in
                markStarted.yield()
                await release.wait()
                return imageData
            }
        }
        for await _ in started { break }
        cache.removeAll()
        await release.open()

        #expect(await pending.value == nil)
        #expect(cache.image(for: url) == nil)
    }

    private static let onePixelPNG =
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
}

private actor FetchCount {
    private(set) var value = 0
    func increment() { value += 1 }
}

/// Holds a fetch open until the test releases it, ignoring cancellation so
/// the load's own guard is what keeps a late answer out of the cache.
private actor FetchGate {
    private var isOpen = false
    private var waiters: [CheckedContinuation<Void, Never>] = []

    func wait() async {
        guard !isOpen else { return }
        await withCheckedContinuation { waiters.append($0) }
    }

    func open() {
        isOpen = true
        waiters.forEach { $0.resume() }
        waiters.removeAll()
    }
}
