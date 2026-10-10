import Foundation

/// What a tail read should do for one list.
public enum TailPlan: Equatable, Sendable {
    /// Nothing to read: the list is browsing history (it reloads its newest
    /// page when the reader returns), or its scans already cover the event.
    case skip
    /// `chat.messages(afterSequence:)` with the list's own filter.
    case read(afterSequence: Int)
}

/// The bookkeeping that keeps targeted reads converging (specs/realtime-events.md,
/// iPhone impact): the `tailNeeded` bits, and the per-Chat dirty sets with the
/// list reads in flight that could seed an older copy over a refreshed entity.
///
/// List reads themselves stay serialized by their own owners (Chat history
/// tickets, the inline-reply load set); this value only says what to run when
/// a read settles.
public struct TranscriptReads: Equatable, Sendable {
    private var tailNeeded: [TranscriptKey: Int] = [:]
    private var dirtyByChatID: [String: Set<String>] = [:]
    private var listReadsByChatID: [String: Int] = [:]
    /// Advances when a label update makes every tail read in flight suspect.
    public private(set) var tailEpoch = 0

    public init() {}

    /// Decides one tail read. A list scrolled into history does nothing (the
    /// reader's return reloads it); a list whose scans already reach the event
    /// does nothing; anything else resumes after its last scan, which also
    /// fills a gap left by a missed event.
    public static func tailPlan(for list: TranscriptList?, through sequence: Int) -> TailPlan {
        guard let list, list.reachesNewest, list.scannedThroughSequence < sequence else { return .skip }
        return .read(afterSequence: list.scannedThroughSequence)
    }

    // MARK: - Tail bits

    /// Sets the list's tail bit, keeping the highest event sequence that set
    /// it. However many events arrive, one tail read drains the bit.
    public mutating func noteTail(_ key: TranscriptKey, through sequence: Int) {
        tailNeeded[key] = max(tailNeeded[key] ?? 0, sequence)
    }

    /// Clears and returns the list's tail bit.
    public mutating func takeTail(_ key: TranscriptKey) -> Int? {
        tailNeeded.removeValue(forKey: key)
    }

    /// A label update: a tail read in flight may carry messages under the
    /// former label, and no carrier refresh names a message the cache has not
    /// seen yet. Every tail begun before now lands nothing.
    public mutating func invalidateTails() {
        tailEpoch += 1
    }

    /// Whether a tail read begun in `epoch` may write. One that may not sets
    /// the list's tail bit again, so the drain reads it afresh.
    public mutating func acceptsTail(_ key: TranscriptKey, through sequence: Int, epoch: Int) -> Bool {
        guard epoch != tailEpoch else { return true }
        noteTail(key, through: sequence)
        return false
    }

    // MARK: - Dirty sets

    /// Records a message whose annotations changed. List reads already in
    /// flight for its Chat may still land an older copy, so each of them
    /// re-refreshes it as it settles.
    public mutating func markDirty(_ refresh: EntityRefresh) {
        guard listReadsByChatID[refresh.chatID, default: 0] > 0 else { return }
        dirtyByChatID[refresh.chatID, default: []].insert(refresh.messageID)
    }

    public mutating func beginListRead(chatID: String) {
        listReadsByChatID[chatID, default: 0] += 1
    }

    /// Settles one list read. Returns the dirty ids to read again now that
    /// it has seeded; the set clears once no list read for the Chat remains.
    public mutating func finishListRead(chatID: String) -> Set<String> {
        let remaining = listReadsByChatID[chatID, default: 0] - 1
        let dirty = dirtyByChatID[chatID] ?? []
        if remaining > 0 {
            listReadsByChatID[chatID] = remaining
        } else {
            listReadsByChatID.removeValue(forKey: chatID)
            dirtyByChatID.removeValue(forKey: chatID)
        }
        return dirty
    }

    /// A Server change or loss: drops every bit and set, and retires every
    /// tail read in flight.
    public mutating func reset() {
        let epoch = tailEpoch
        self = TranscriptReads()
        tailEpoch = epoch + 1
    }

    /// A deleted Chat: nothing of it may run again.
    public mutating func purge(chatID: String) {
        tailNeeded = tailNeeded.filter { $0.key.chatID != chatID }
        dirtyByChatID.removeValue(forKey: chatID)
        listReadsByChatID.removeValue(forKey: chatID)
    }
}
