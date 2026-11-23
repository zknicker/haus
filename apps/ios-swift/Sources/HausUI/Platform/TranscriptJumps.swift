/// The explicit jumps a transcript offers: back to the latest message, and up
/// to the first unread one.
struct TranscriptJumps: Equatable {
    let showsLatest: Bool
    let showsUnread: Bool

    init(isNearNewest: Bool, hasNewer: Bool, unread: TranscriptUnreadJump) {
        showsLatest = !isNearNewest || hasNewer
        showsUnread = unread.offersJump
    }
}

/// Where the first unread message stands against what the reader has seen.
///
/// The jump is offered while that message sits above the viewport — loaded
/// above it, or not loaded yet — and is spent for good once the message has
/// been on screen or the reader took the jump.
struct TranscriptUnreadJump: Equatable {
    let messageID: String?
    private(set) var isSpent = false
    private(set) var isAbove = false

    init(messageID: String?) {
        self.messageID = messageID
    }

    var offersJump: Bool { messageID != nil && !isSpent && isAbove }

    /// Reads one settled viewport. `visibleIDs` is newest first, the way the
    /// transcript publishes it; `loadedIDs` is oldest first.
    func observing(visibleIDs: [String], loadedIDs: [String]) -> Self {
        guard let messageID, !isSpent, !visibleIDs.isEmpty else { return self }
        var next = self
        if visibleIDs.contains(messageID) {
            next.isSpent = true
            return next
        }
        guard let unreadIndex = loadedIDs.firstIndex(of: messageID) else {
            next.isAbove = true
            return next
        }
        let visible = Set(visibleIDs)
        let oldestVisible = loadedIDs.firstIndex(where: visible.contains) ?? loadedIDs.count
        next.isAbove = unreadIndex < oldestVisible
        return next
    }

    /// The reader took the jump.
    func spent() -> Self {
        var next = self
        next.isSpent = true
        return next
    }
}
