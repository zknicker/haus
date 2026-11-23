import CoreGraphics

/// The reader's own send held under the top clearance by a tail inset: the
/// flipped table's top inset grows to `boundsHeight - topClearance -
/// landedHeight`, and shrinks by exactly what replies below it add, until it
/// is back to the composer's clearance.
enum TranscriptSendLanding {
    /// The visual-bottom clearance that rests the landed row's top under the
    /// top clearance, never less than the composer's own clearance.
    static func tailInset(
        base: CGFloat,
        boundsHeight: CGFloat,
        topClearance: CGFloat,
        landedHeight: CGFloat
    ) -> CGFloat {
        max(base, boundsHeight - topClearance - landedHeight)
    }

    /// Whether the replies under the landed row have filled the room it
    /// held open.
    static func isFilled(
        base: CGFloat,
        boundsHeight: CGFloat,
        topClearance: CGFloat,
        landedHeight: CGFloat
    ) -> Bool {
        boundsHeight - topClearance - landedHeight <= base
    }

    /// The landed row after an update: kept, handed to the durable row that
    /// replaced an optimistic one at the tail, or ended.
    static func reconcile(_ landedID: String?, old: [String], new: [String]) -> String? {
        guard let landedID else { return nil }
        if new.contains(landedID) { return landedID }
        guard let oldIndex = old.firstIndex(of: landedID) else { return nil }
        let replaced = TranscriptListUpdate.replacedTailCount(old: old, new: new)
        let firstReplaced = old.count - replaced
        guard replaced > 0, oldIndex >= firstReplaced else { return nil }
        let survivors = Set(new)
        guard let lastShared = old[..<firstReplaced].last(where: survivors.contains),
              let sharedIndex = new.firstIndex(of: lastShared)
        else { return nil }
        let index = sharedIndex + 1 + (oldIndex - firstReplaced)
        return new.indices.contains(index) ? new[index] : nil
    }
}
