import Foundation
import SwiftUI

/// A staged local image decoded once, downsampled, and ready to render.
///
/// The bitmap travels with the SwiftUI `Image` because a staged photo becomes a
/// sent attachment's thumbnail, and that thumbnail is what the viewer zooms.
struct LocalAttachmentImageEntry {
    let bitmap: CGImage
    let image: Image
    /// The staged file's own pixel size, not the downsampled decode's, so a
    /// pending tile sizes itself against the picture the person picked.
    let pixelWidth: Int
    let pixelHeight: Int
    /// Classified beside the decode, off the main actor, so a pending upload's
    /// transparency grid is there on the tile's first frame — and so the sent
    /// row that adopts this bitmap inherits the answer with it.
    let backdrop: AttachmentImageBackdrop

    init(bitmap: DecodedAttachmentBitmap, backdrop: AttachmentImageBackdrop) {
        self.bitmap = bitmap.cgImage
        image = Image(decorative: bitmap.cgImage, scale: 1, orientation: .up)
        pixelWidth = bitmap.sourcePixelWidth
        pixelHeight = bitmap.sourcePixelHeight
        self.backdrop = backdrop
    }
}

/// Process-wide cache of decoded staged-file images keyed by file URL.
///
/// The composer renders a staged photo from many places at once — the 88pt
/// strip tile, the picker-to-composer morph (re-evaluated every frame), and
/// the pending message tile. Decoding the full-resolution file inside `body`
/// made every keystroke and every morph frame pay a synchronous full decode.
/// One downsampled ImageIO decode per file, performed off the main actor,
/// serves them all; a cache hit renders on the first frame with no async hop.
@MainActor
final class LocalAttachmentImageCache {
    static let shared = LocalAttachmentImageCache()

    /// 88pt composer tiles at 3x need 264px and the inline pending tile tops
    /// out at the timeline tile budget (480px), so one 512px decode serves
    /// every local rendering of a staged file.
    static let maxPixelSize: CGFloat = 512

    private let cache = NSCache<NSString, EntryBox>()
    private var loads: [String: Task<Void, Never>] = [:]
    /// Bumped by `removeAll()`, so a decode that began before it can neither
    /// store its entry nor clear the slot of a decode that began after it.
    private var generation = 0

    init() {
        cache.countLimit = 40
        cache.totalCostLimit = 32 * 1024 * 1024
    }

    func entry(for url: URL) -> LocalAttachmentImageEntry? {
        cache.object(forKey: url.path as NSString)?.entry
    }

    /// Fire-and-forget decode so a freshly staged photo is already renderable
    /// when its first tile appears.
    func warm(url: URL) {
        Task { _ = await self.load(url: url) }
    }

    func load(url: URL) async -> LocalAttachmentImageEntry? {
        if let hit = entry(for: url) { return hit }
        let key = url.path
        let loadGeneration = generation
        let task: Task<Void, Never>
        if let active = loads[key] {
            task = active
        } else {
            task = Task { [weak self] in
                guard
                    let bitmap = await AttachmentImageDecoder.decode(
                        at: url,
                        maxPixelSize: Self.maxPixelSize
                    )
                else { return }
                let backdrop = await AttachmentImageBackdrop.classified(bitmap)
                guard let self, loadGeneration == generation else { return }
                store(bitmap, backdrop: backdrop, for: key)
            }
            loads[key] = task
        }
        await task.value
        if loadGeneration == generation { loads[key] = nil }
        return entry(for: url)
    }

    func removeAll() {
        generation += 1
        for load in loads.values { load.cancel() }
        loads.removeAll()
        cache.removeAllObjects()
    }

    private func store(
        _ bitmap: DecodedAttachmentBitmap,
        backdrop: AttachmentImageBackdrop,
        for key: String
    ) {
        let entry = LocalAttachmentImageEntry(bitmap: bitmap, backdrop: backdrop)
        cache.setObject(EntryBox(entry: entry), forKey: key as NSString, cost: bitmap.pixelCost)
    }

    private final class EntryBox {
        let entry: LocalAttachmentImageEntry
        init(entry: LocalAttachmentImageEntry) { self.entry = entry }
    }
}

/// Renders a staged local image from the process-wide decoded cache. A cache
/// hit paints fully formed on the first frame; a miss shows the caller's
/// backing surface for the single async hop the off-main decode takes.
struct LocalAttachmentImage: View {
    let url: URL

    @State private var failedURL: URL?
    /// The landed decode, held as state `body` renders from. SwiftUI
    /// invalidates a view only for state its body actually reads, so the
    /// async landing must arrive through the rendered value itself — writing
    /// a side-channel marker the body never reads leaves a successful decode
    /// painted as the placeholder forever. The cache read below is the
    /// recycled-view fast path, not the invalidation.
    @State private var loaded: LoadedLocalAttachmentImage?

    var body: some View {
        let cached = loaded?.entry(for: url) ?? LocalAttachmentImageCache.shared.entry(for: url)
        let needsLoad = cached == nil && failedURL != url
        Group {
            if let cached {
                cached.image
                    .resizable()
                    .scaledToFill()
            } else if failedURL == url {
                HausIcon(.image, size: 19, weight: 1.6)
                    .foregroundStyle(.secondary)
            } else {
                Color.clear
            }
        }
        .task(id: url) {
            guard needsLoad else { return }
            if let entry = await LocalAttachmentImageCache.shared.load(url: url) {
                loaded = LoadedLocalAttachmentImage(url: url, entry: entry)
            } else {
                failedURL = url
            }
        }
    }
}

/// One landed decode pinned to the URL it belongs to, so a reused view whose
/// URL changed cannot render the previous file while the new one loads.
private struct LoadedLocalAttachmentImage {
    let url: URL
    let entry: LocalAttachmentImageEntry

    func entry(for url: URL) -> LocalAttachmentImageEntry? {
        self.url == url ? entry : nil
    }
}
