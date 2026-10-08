import Foundation

/// Which transcripts draw a chip that resolves against another Chat's page.
///
/// A Thread chip names its anchor's first line, read from the parent Chat's
/// page, so a write to that page changes rows in every transcript that links
/// to one of its Threads. The memoized rows are retired per Chat; this index
/// is how a page write finds the other Chats it reaches.
public struct ReferenceReferrers {
    private var referrersByChatID: [String: Set<String>] = [:]

    public init() {}

    /// Records that `referrer`'s rows resolve chips against each referenced
    /// Chat's page. A Chat referencing itself needs no entry: its own page
    /// write already retires it.
    public mutating func record(referrer: String, references: some Sequence<String>) {
        for chatID in references where chatID != referrer {
            referrersByChatID[chatID, default: []].insert(referrer)
        }
    }

    /// The Chats whose rows read any of `chatIDs`, forgetting them: once
    /// retired, a referrer records itself again when it rebuilds.
    public mutating func takeReferrers(of chatIDs: Set<String>) -> Set<String> {
        var referrers: Set<String> = []
        for chatID in chatIDs {
            if let found = referrersByChatID.removeValue(forKey: chatID) { referrers.formUnion(found) }
        }
        return referrers
    }

    public mutating func removeAll() {
        referrersByChatID.removeAll()
    }
}
