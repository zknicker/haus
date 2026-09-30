/// Every decoded attachment image this process holds in memory: timeline
/// thumbnails, viewer full-resolution pages, and staged composer files.
@MainActor
public enum AttachmentImageMemory {
    /// Sign-out calls this so the next account on this device never paints
    /// the previous account's pictures. Decodes already in flight cannot
    /// repopulate any of the emptied caches.
    public static func removeAll() {
        AttachmentImageCache.shared.removeAll()
        AttachmentFullImageCache.shared.removeAll()
        LocalAttachmentImageCache.shared.removeAll()
    }
}
