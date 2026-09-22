import Foundation

/// The App's bounded policy for inactive Chat history pages.
///
/// The Store owns the actual pages. This value only tracks recency, so
/// mounted, pending, or in-flight Chats can be protected while inactive pages
/// are selected for eviction.
public struct ChatHistoryRetention: Equatable, Sendable {
    public static let defaultCapacity = 6

    public let capacity: Int
    private var leastRecentlyUsedFirst: [String]

    public init(capacity: Int = Self.defaultCapacity) {
        self.capacity = max(1, capacity)
        leastRecentlyUsedFirst = []
    }

    /// Chat IDs ordered from the next eviction candidate to the newest touch.
    public var orderedChatIDs: [String] {
        leastRecentlyUsedFirst
    }

    /// Adds a Chat to the policy or moves an existing Chat to the newest end.
    public mutating func touch(_ chatID: String) {
        leastRecentlyUsedFirst.removeAll { $0 == chatID }
        leastRecentlyUsedFirst.append(chatID)
    }

    /// Removes a Chat that has left the Store's cache.
    public mutating func remove(_ chatID: String) {
        leastRecentlyUsedFirst.removeAll { $0 == chatID }
    }

    /// Synchronizes the policy with cached IDs and returns evictions in LRU
    /// order. Protected IDs are retained even when that exceeds the capacity.
    @discardableResult
    public mutating func evictions(
        cachedIDs: Set<String>,
        protectedIDs: Set<String>
    ) -> [String] {
        leastRecentlyUsedFirst.removeAll { !cachedIDs.contains($0) }

        let known = Set(leastRecentlyUsedFirst)
        for chatID in cachedIDs.subtracting(known).sorted() {
            leastRecentlyUsedFirst.append(chatID)
        }

        let countToEvict = max(0, cachedIDs.count - capacity)
        guard countToEvict > 0 else { return [] }

        var evicted: [String] = []
        for chatID in leastRecentlyUsedFirst where !protectedIDs.contains(chatID) {
            guard evicted.count < countToEvict else { break }
            evicted.append(chatID)
        }
        leastRecentlyUsedFirst.removeAll { evicted.contains($0) }
        return evicted
    }
}
