import Foundation

/// One thought line in the typing strip; `id` keys its enter and exit.
public struct ChatTypingThought: Sendable, Equatable, Identifiable {
    public let id: Int
    public let agentID: String
    public let runID: String
    public let text: String

    public init(id: Int, agentID: String, runID: String, text: String) {
        self.id = id
        self.agentID = agentID
        self.runID = runID
        self.text = text
    }
}

/// The thought on screen: when it appeared and when its hold ends.
public struct ChatTypingThoughtOnScreen: Sendable, Equatable {
    public let thought: ChatTypingThought
    public let shownAt: TimeInterval
    public var hideAt: TimeInterval

    public init(thought: ChatTypingThought, shownAt: TimeInterval, hideAt: TimeInterval) {
        self.thought = thought
        self.shownAt = shownAt
        self.hideAt = hideAt
    }
}

/// What an arriving thought does (the App's `resolveChatTypingThoughtArrival`).
public enum ChatTypingThoughtArrival: Sendable, Equatable {
    /// A new line: it enters, replacing whatever was shown.
    case show
    /// The same line from the same run while it is up: hold it longer.
    case extend(hideAt: TimeInterval)
    /// The same line again with nothing left to add under the visible cap.
    case absorb
}

/// The App's thought timing (`chat-typing-thought.ts`), in seconds. Times are
/// a monotonic clock the caller supplies, so every rule is testable as a pure
/// function of `now`.
public enum ChatTypingThoughtPacing {
    /// How long the line takes to arrive before its hold starts counting.
    public static let enter: TimeInterval = 0.62
    public static let minimumHold: TimeInterval = 5
    public static let maximumHold: TimeInterval = 7.5
    /// However often a line repeats, it leaves after this long on screen.
    public static let maximumVisible: TimeInterval = 12
    /// Lines start at least this far apart, so a newer one never cuts the last
    /// short before its shortest hold.
    public static let spacing: TimeInterval = minimumHold

    /// About 3.5 seconds to notice the line plus 350ms a word, between 5 and
    /// 7.5 seconds: an eight-word line holds about 6.3 seconds.
    public static func hold(for text: String) -> TimeInterval {
        let words = text.split(whereSeparator: \.isWhitespace).count
        return min(maximumHold, max(minimumHold, 3.5 + 0.35 * Double(words)))
    }

    public static func arrival(
        of next: ChatTypingThought,
        onScreen: ChatTypingThoughtOnScreen?,
        now: TimeInterval
    ) -> ChatTypingThoughtArrival {
        guard let onScreen,
              onScreen.thought.agentID == next.agentID,
              onScreen.thought.runID == next.runID,
              normalized(onScreen.thought.text) == normalized(next.text)
        else { return .show }
        let hideAt = min(now + hold(for: next.text), onScreen.shownAt + maximumVisible)
        return hideAt > onScreen.hideAt ? .extend(hideAt: hideAt) : .absorb
    }

    /// How long a new line waits before it may show. An engagement's first
    /// line never waits, so every turn shows a thought early.
    public static func delay(
        lastShownAt: TimeInterval?,
        now: TimeInterval,
        firstOfEngagement: Bool
    ) -> TimeInterval {
        guard let lastShownAt, !firstOfEngagement else { return 0 }
        return max(0, lastShownAt + spacing - now)
    }

    /// A line's words for comparison: case, punctuation, and spacing ignored.
    public static func normalized(_ text: String) -> String {
        let kept = text.lowercased().unicodeScalars.filter {
            CharacterSet.letters.contains($0)
                || CharacterSet.decimalDigits.contains($0)
                || CharacterSet.whitespacesAndNewlines.contains($0)
        }
        return String(String.UnicodeScalarView(kept))
            .split(whereSeparator: \.isWhitespace)
            .joined(separator: " ")
    }
}
