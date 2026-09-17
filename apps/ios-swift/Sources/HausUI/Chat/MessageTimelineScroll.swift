/// The transcript's scroll decisions, kept separate from the view that acts on
/// them: what a new tail message is allowed to do, and whether a request to
/// reveal one message can be satisfied yet. Viewport position itself is owned
/// by `TranscriptListView`, whose flipped-table substrate makes the bottom
/// anchor structural.

/// Resolves a request to reveal one message against the loaded page.
enum MessageTimelineScrollTarget {
    enum Resolution: Equatable {
        /// No page is loaded yet; keep the request until messages arrive.
        case waiting
        case reveal(String)
        /// The loaded page does not contain the message; drop the request.
        case unavailable
    }

    static func resolve(target: String, messageIDs: [String]) -> Resolution {
        if messageIDs.isEmpty {
            return .waiting
        }
        return messageIDs.contains(target) ? .reveal(target) : .unavailable
    }

    /// A reply reference carries the parent's sequence when it came from the
    /// Server. Once the loaded page reaches that sequence, another older page
    /// cannot contain the target and the caller can report it as unavailable.
    static func shouldLoadOlder(
        targetSequence: Int?,
        loadedMessageSequences: [Int],
        hasOlderMessages: Bool
    ) -> Bool {
        guard hasOlderMessages else { return false }
        guard let targetSequence, let oldest = loadedMessageSequences.min() else {
            return true
        }
        return targetSequence < oldest
    }
}

/// How the timeline reaches a new tail message. A page that arrives for a Chat
/// that was showing nothing is that Chat's first paint, so it has to appear
/// already settled at the bottom rather than sweeping there.
enum MessageTimelineTailScroll: Equatable {
    case ignore
    case snap
    case animate

    /// Pending rows are created only for the viewer's outgoing sends. That lets
    /// a send reveal itself even if the user had scrolled slightly above the
    /// tail; other incoming messages respect the reader's current position.
    static func decide(
        hadMessages: Bool,
        isNearBottom: Bool,
        isLatestPending: Bool
    ) -> Self {
        guard hadMessages else { return .snap }
        return isNearBottom || isLatestPending ? .animate : .ignore
    }
}

