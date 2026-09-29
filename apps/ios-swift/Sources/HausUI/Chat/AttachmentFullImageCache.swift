import Foundation
import SwiftUI
#if os(iOS)
import UIKit
#endif

/// One full-resolution attachment decode, with the ground it belongs on.
///
/// The bitmap travels beside the SwiftUI `Image`: the viewer's page zooms it in
/// a `UIImageView`, which needs the decode itself as its layer contents.
struct AttachmentFullImage {
    let bitmap: CGImage
    let image: Image
    let backdrop: AttachmentImageBackdrop
    let pixelCost: Int

    init(bitmap: CGImage, backdrop: AttachmentImageBackdrop, pixelCost: Int) {
        self.bitmap = bitmap
        image = Image(decorative: bitmap, scale: 1, orientation: .up)
        self.backdrop = backdrop
        self.pixelCost = pixelCost
    }
}

/// In-memory cache of full-resolution viewer decodes, a sibling of
/// `AttachmentImageCache` and deliberately not the same store: tile bitmaps are
/// small, numerous, and wanted for the whole scrollback, while these are large,
/// few, and wanted only around the page the reader is on.
///
/// The bound is an explicit LRU rather than `NSCache` because this cache is the
/// only thing standing between a long chat of large photos and the jetsam
/// limit, and `NSCache`'s eviction is advisory — it decides when, and how much,
/// on its own. Here the ceiling is exact and provable. What `NSCache` gives away
/// with it is the automatic purge under memory pressure, so this cache answers
/// the memory warning itself: a viewer is a transient surface, and every page it
/// holds can be decoded again from bytes already on disk.
@MainActor
final class AttachmentFullImageCache {
    static let shared = AttachmentFullImageCache()

    private var entries: [String: AttachmentFullImage] = [:]
    /// Least recently used first.
    private var order: [String] = []
    private var cost = 0
    /// Bumped by `removeAll()` on sign-out, not on memory pressure. A decode
    /// captures it before its first await and hands it back to `store`, so
    /// one that began before a sign-out cannot repopulate the emptied cache.
    private(set) var generation = 0

    let countLimit: Int
    let costLimit: Int

    /// A screen's worth of decode is roughly 6 MB. Eight pages is several swipes
    /// either side of the current one — well past the pair the viewer prefetches
    /// — under a hard 64 MB cap.
    init(countLimit: Int = 8, costLimit: Int = 64 * 1024 * 1024) {
        self.countLimit = countLimit
        self.costLimit = costLimit
        observeMemoryPressure()
    }

    var count: Int { entries.count }
    var totalCost: Int { cost }

    func image(for attachmentID: String) -> AttachmentFullImage? {
        guard let entry = entries[attachmentID] else { return nil }
        touch(attachmentID)
        return entry
    }

    func store(
        _ image: AttachmentFullImage,
        for attachmentID: String,
        loadedIn loadGeneration: Int? = nil
    ) {
        guard loadGeneration.map({ $0 == generation }) ?? true else { return }
        if let existing = entries[attachmentID] {
            cost -= existing.pixelCost
            order.removeAll { $0 == attachmentID }
        }
        entries[attachmentID] = image
        order.append(attachmentID)
        cost += image.pixelCost
        evictToLimits()
    }

    /// Forgets this account's decodes on sign-out.
    func removeAll() {
        generation += 1
        evictAll()
    }

    private func observeMemoryPressure() {
        #if os(iOS)
        NotificationCenter.default.addObserver(
            forName: UIApplication.didReceiveMemoryWarningNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            MainActor.assumeIsolated { self?.evictAll() }
        }
        #endif
    }

    private func evictAll() {
        entries.removeAll()
        order.removeAll()
        cost = 0
    }

    private func touch(_ attachmentID: String) {
        guard let index = order.firstIndex(of: attachmentID) else { return }
        order.remove(at: index)
        order.append(attachmentID)
    }

    /// The most recently stored entry is never evicted: the page being looked
    /// at has to survive its own insertion, whatever it cost.
    private func evictToLimits() {
        while order.count > 1, entries.count > countLimit || cost > costLimit {
            let evicted = order.removeFirst()
            cost -= entries.removeValue(forKey: evicted)?.pixelCost ?? 0
        }
    }
}
