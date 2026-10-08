import Foundation

#if canImport(UIKit)
import UIKit
typealias AvatarPlatformImage = UIImage
#elseif canImport(AppKit)
import AppKit
typealias AvatarPlatformImage = NSImage
#endif

/// Process-wide decoded avatar cache over a disk-persisted byte cache.
///
/// Avatar URLs are immutable Server resources. Keeping their decoded images
/// here lets a newly constructed chat render a previously seen identity in
/// its first frame instead of briefly falling back to initials. In-flight
/// requests are shared so repeated rows do not download the same avatar. The
/// bytes behind those images survive the process in `Self.session`'s own
/// `URLCache`, so a cold launch paints known identities instead of showing
/// initials until the network answers.
@MainActor
public final class AvatarImageCache {
    public static let shared = AvatarImageCache()

    private let images = NSCache<NSURL, PlatformImageBox>()
    private var loads: [URL: Task<PlatformImageBox?, Never>] = [:]
    /// URLs whose bytes were not on disk when a render asked, so a row redrawn
    /// before its download lands does not read the disk again for nothing.
    /// Every other URL — including one `images` evicted under pressure — is
    /// restored from disk synchronously, so a recycled row never flips to
    /// initials over an avatar it already drew.
    private var diskMisses: Set<URL> = []
    /// Bumped by `removeAll()`, so a load that began before it can neither
    /// store its image nor clear the slot of a load that began after it.
    private var generation = 0
    /// The bytes behind every decoded image. Tests hand in their own; the app
    /// always uses the one its download session writes to.
    private let byteCache: URLCache

    init(byteCache: URLCache = AvatarImageCache.defaultByteCache) {
        self.byteCache = byteCache
        images.countLimit = 100
        images.totalCostLimit = 32 * 1024 * 1024
    }

    /// The avatar's decoded pixels, ready for a synchronous render. An entry
    /// the memory cache has evicted, or one this process has not drawn yet, is
    /// restored from the disk byte cache, so the first frame after a cold
    /// launch paints faces the reader has already seen instead of initials.
    /// Each URL consults the disk at most once until it loads: a URL with no
    /// stored bytes stops claiming to be resolved and is not looked up again,
    /// so the caller falls back to initials rather than rendering blank.
    func image(for url: URL) -> AvatarPlatformImage? {
        if let cached = images.object(forKey: url as NSURL)?.image {
            return cached
        }
        guard !diskMisses.contains(url) else { return nil }
        guard let data = byteCache.cachedResponse(for: URLRequest(url: url))?.data,
              let decoded = AvatarImageDecoder.decodeCachedBytes(data)
        else {
            diskMisses.insert(url)
            return nil
        }
        return store(decoded, for: url).image
    }

    func load(
        url: URL,
        fetch: ((URL) async -> Data?)? = nil
    ) async -> AvatarPlatformImage? {
        if let cached = image(for: url) {
            return cached
        }

        if let active = loads[url] {
            return await active.value?.image
        }
        let request = fetch ?? Self.fetch
        let loadGeneration = generation
        let task = Task { () -> PlatformImageBox? in
            defer { if loadGeneration == generation { loads[url] = nil } }
            guard let data = await request(url),
                  let decoded = await AvatarImageDecoder.decode(data),
                  loadGeneration == generation
            else { return nil }
            return store(decoded, for: url)
        }
        loads[url] = task
        return await task.value?.image
    }

    /// Forgets every avatar, decoded and on disk. Sign-out calls this so the
    /// next account on this device starts from its own Server's avatars.
    /// In-flight loads are cancelled and cannot repopulate the emptied cache.
    public func removeAll() {
        generation += 1
        for load in loads.values { load.cancel() }
        loads.removeAll()
        images.removeAllObjects()
        diskMisses.removeAll()
        byteCache.removeAllCachedResponses()
    }

    private func store(_ decoded: DecodedAvatarBitmap, for url: URL) -> PlatformImageBox {
        #if canImport(UIKit)
        let image = UIImage(cgImage: decoded.image)
        #elseif canImport(AppKit)
        let image = NSImage(cgImage: decoded.image, size: .zero)
        #endif
        let box = PlatformImageBox(image: image)
        images.setObject(
            box,
            forKey: url as NSURL,
            cost: decoded.pixelCost
        )
        diskMisses.remove(url)
        return box
    }

    /// Avatars get their own byte cache because `URLSession.shared` caches for
    /// ordinary API traffic and evicts image bytes long before the next launch
    /// needs them. It also outlives the decoded `NSCache`, which is what lets
    /// an evicted avatar come back without a round trip.
    static let defaultByteCache = URLCache(
        memoryCapacity: 4 * 1024 * 1024,
        diskCapacity: 64 * 1024 * 1024,
        directory: FileManager.default
            .urls(for: .cachesDirectory, in: .userDomainMask)
            .first?
            .appendingPathComponent("haus-avatars", isDirectory: true)
    )

    private static let session: URLSession = {
        let configuration = URLSessionConfiguration.default
        configuration.urlCache = defaultByteCache
        return URLSession(configuration: configuration)
    }()

    private static func fetch(_ url: URL) async -> Data? {
        do {
            // An avatar URL names immutable bytes, which is the license to
            // answer from disk without revalidating: whatever the Server said
            // about freshness cannot make a stored avatar wrong.
            let request = URLRequest(url: url, cachePolicy: .returnCacheDataElseLoad)
            let (data, response) = try await session.data(for: request)
            guard let response = response as? HTTPURLResponse,
                  (200..<300).contains(response.statusCode)
            else { return nil }
            return data
        } catch {
            return nil
        }
    }

    @MainActor
    private final class PlatformImageBox {
        let image: AvatarPlatformImage
        init(image: AvatarPlatformImage) { self.image = image }
    }
}
