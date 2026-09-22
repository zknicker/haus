import Foundation

/// How one transcript snapshot becomes the next, classified so the list can
/// keep the scroll anchored without guessing.
///
/// A transcript update is safe to batch when the IDs shared by both snapshots
/// remain in the same order. This covers edge pages, bounded windows, and a
/// fixed prefix whose reply rows slide underneath it. Reordered or disjoint
/// snapshots stay on the reload path.
enum TranscriptListUpdate: Equatable {
    /// The id sequence is unchanged; content may have changed in place.
    case refresh
    /// `appended` newer items arrived at the chronological tail.
    case append(appended: Int)
    /// `prepended` older items arrived at the chronological head.
    case prepend(prepended: Int)
    /// The sequences do not extend one another; rebuild from scratch.
    case reset

    /// Shared IDs retain their order; rows elsewhere may enter or leave.
    case window(appended: Int)

    var tailInsertionCount: Int {
        switch self {
        case .append(let count), .window(let count): count
        case .refresh, .prepend, .reset: 0
        }
    }

    static func classify(old: [String], new: [String]) -> TranscriptListUpdate {
        guard !old.isEmpty, !new.isEmpty else {
            return old.isEmpty && new.isEmpty ? .refresh : .reset
        }
        if old.count == new.count, old == new { return .refresh }

        // IDs are the identity contract for this list. Duplicate IDs make an
        // edge diff ambiguous, so leave those snapshots on the reload path.
        guard Set(old).count == old.count, Set(new).count == new.count else {
            return .reset
        }

        let oldIDs = Set(old)
        let newIDs = Set(new)
        let sharedInOldOrder = old.filter(newIDs.contains)
        let sharedInNewOrder = new.filter(oldIDs.contains)
        guard !sharedInOldOrder.isEmpty, sharedInOldOrder == sharedInNewOrder else {
            return .reset
        }

        if new.starts(with: old) {
            return .append(appended: new.count - old.count)
        }
        if new.suffix(old.count).elementsEqual(old) {
            return .prepend(prepended: new.count - old.count)
        }
        guard let lastShared = new.lastIndex(where: oldIDs.contains) else { return .reset }
        return .window(appended: new.count - lastShared - 1)
    }
}
