import Foundation

/// Parsed message bodies, remembered per message.
///
/// Parsing a body (visual fences, Markdown blocks, reference chips) is the
/// expensive part of projecting a transcript row, and almost every rebuild —
/// a presence change, an unread count, a neighbouring page write — leaves the
/// body untouched. An entry is reused while its message id, raw content, and
/// the reference revision it resolved chips against all still match.
public struct MessageBodyMemo<Value> {
    private struct Entry {
        let content: String
        let revision: Int
        let value: Value
    }

    private var entries: [String: Entry] = [:]
    /// Past this many entries the memo starts over rather than tracking
    /// recency: a full reparse of what is on screen is the worst case.
    public let capacity: Int

    public init(capacity: Int = 2_000) {
        self.capacity = capacity
    }

    public var count: Int { entries.count }

    /// The remembered value, while its id, content, and revision all match.
    public func cached(id: String, content: String, revision: Int) -> Value? {
        guard let entry = entries[id], entry.revision == revision, entry.content == content else {
            return nil
        }
        return entry.value
    }

    /// Split from `cached` on purpose: building a value usually reads other
    /// memoized state that shares this memo's owner, which a closure running
    /// inside a mutating call here would access exclusively.
    public mutating func remember(_ value: Value, id: String, content: String, revision: Int) {
        if entries.count >= capacity, entries[id] == nil { entries.removeAll(keepingCapacity: true) }
        entries[id] = Entry(content: content, revision: revision, value: value)
    }

    public mutating func removeAll() {
        entries.removeAll()
    }
}


public enum KeyedChanges {
    /// The keys whose values differ between two snapshots of a keyed store,
    /// including keys present on only one side.
    public static func between<Key: Hashable, Value: Equatable>(
        _ old: [Key: Value],
        _ new: [Key: Value]
    ) -> Set<Key> {
        var changed: Set<Key> = []
        for (key, value) in new where old[key] != value {
            changed.insert(key)
        }
        for key in old.keys where new[key] == nil {
            changed.insert(key)
        }
        return changed
    }
}
