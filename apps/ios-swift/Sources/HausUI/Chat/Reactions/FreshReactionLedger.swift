import Foundation

/// App-local memory of which reactions arrived live, so only those stamp in.
/// A port of the App's `fresh-reactions.ts`.
///
/// Durable chat data never learns about this. A `message.reaction.updated`
/// names only the message, so the ledger marks that message live for a short
/// window, and the next render that shows a reaction it had not seen before
/// treats it as an arrival. The viewer's own add is held as a pending overlay
/// until the Server's copy lands, which is what lets it appear — and stamp —
/// before the round trip finishes. History, reloads, and relaunches find no
/// live mark and no baseline, so they always render at rest.
struct FreshReactionLedger: Sendable {
    /// A catch-up replay after a reconnect carries old events; those are history.
    static let liveEventMaxAge: TimeInterval = 30
    /// How long after a live event its refetched page may still count as an arrival.
    static let liveWindow: TimeInterval = 8
    /// A pending own add that never reconciles is dropped rather than shown forever.
    static let pendingTTL: TimeInterval = 15

    private var baselines: [String: Set<String>] = [:]
    private var liveUntil: [String: Date] = [:]
    /// Pending own adds per message, in tap order, with their expiry.
    private var pendingAdds: [String: [(emoji: String, until: Date)]] = [:]

    mutating func addPending(messageID: String, emoji: String, now: Date) {
        var adds = pendingAdds[messageID, default: []].filter { $0.emoji != emoji }
        adds.append((emoji, now.addingTimeInterval(Self.pendingTTL)))
        pendingAdds[messageID] = adds
    }

    /// Returns whether anything was dropped.
    @discardableResult
    mutating func dropPending(messageID: String, emoji: String) -> Bool {
        guard let adds = pendingAdds[messageID], adds.contains(where: { $0.emoji == emoji }) else {
            return false
        }
        let remaining = adds.filter { $0.emoji != emoji }
        pendingAdds[messageID] = remaining.isEmpty ? nil : remaining
        return true
    }

    /// Marks a message whose reactions changed live. `eventAt` is the event's
    /// own timestamp, which is what tells a live event from a replayed one.
    mutating func noteLive(messageID: String, eventAt: Date, now: Date) {
        guard now.timeIntervalSince(eventAt) <= Self.liveEventMaxAge else { return }
        liveUntil[messageID] = now.addingTimeInterval(Self.liveWindow)
    }

    /// The viewer's unconfirmed adds for one message that have not expired.
    func pending(messageID: String, now: Date) -> [String] {
        (pendingAdds[messageID] ?? []).filter { $0.until > now }.map(\.emoji)
    }

    /// Records the reaction keys a message renders now and returns the keys
    /// that are new *and* arrived live. A message seen for the first time only
    /// sets its baseline, so a page load never stamps.
    mutating func observe(messageID: String, keys: [String], now: Date) -> [String] {
        let baseline = baselines[messageID]
        baselines[messageID] = Set(keys)
        guard let baseline else { return [] }
        let live = (liveUntil[messageID] ?? .distantPast) > now
        let pending = Set(pending(messageID: messageID, now: now))
        return keys.filter { key in
            guard !baseline.contains(key) else { return false }
            return live || pending.contains(Self.emoji(inKey: key))
        }
    }

    private static func emoji(inKey key: String) -> String {
        String(key.prefix { $0 != "\u{0}" })
    }
}

/// Several live arrivals at once land one after another.
enum ReactionStampSchedule {
    static let stagger: TimeInterval = 0.3

    /// Staggers fresh stickers, by key, in pile order. A reaction hidden behind
    /// the "+N" chip has no sticker to stamp.
    static func delays(pileOrder: [String], fresh: [String]) -> [(key: String, delay: TimeInterval)] {
        let fresh = Set(fresh)
        var landing: [(key: String, delay: TimeInterval)] = []
        for key in pileOrder where fresh.contains(key) {
            landing.append((key, Double(landing.count) * stagger))
        }
        return landing
    }
}
