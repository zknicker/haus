import Foundation
import Observation
import SwiftUI
#if canImport(UIKit)
import UIKit
#endif

/// One sticker's stamp, running from `start` (its stagger already applied).
struct ReactionStamp: Equatable, Sendable {
    let start: Date
    /// Restarts the stamp when the same reactor's emoji arrives again.
    let token: Int
}

/// The app-local reaction state every transcript shares: the fresh-reaction
/// ledger, the viewer's unconfirmed adds, and which stickers are stamping.
///
/// The App owns one board per signed-in session and hands it to the
/// transcript through the environment. Nothing here is durable chat state;
/// the stickers themselves always come from the Server's message rows.
@MainActor
@Observable
public final class ReactionStickerBoard {
    /// Bumps whenever a pending own add appears or leaves. A transcript reads it
    /// in its own body so the table re-measures a row that grew a pile.
    public private(set) var revision = 0
    private(set) var stamps: [String: [String: ReactionStamp]] = [:]
    @ObservationIgnored private var ledger = FreshReactionLedger()
    @ObservationIgnored private var viewerUserID: String?
    @ObservationIgnored private var nextToken = 0
    /// Extra wait before an own add stamps, per message, for a row that is
    /// still covered when the add lands (the message drawer sliding away).
    /// It lapses quickly, so an add that stamped nothing (the emoji was
    /// already there) cannot hold back a later arrival.
    @ObservationIgnored private var ownStampDelay: [String: (delay: TimeInterval, until: Date)] = [:]
    @ObservationIgnored private let onToggle: @MainActor (String, String, Bool) -> Void

    /// `onToggle(messageID, emoji, remove)` sends the viewer's reaction.
    public init(onToggle: @escaping @MainActor (String, String, Bool) -> Void = { _, _, _ in }) {
        self.onToggle = onToggle
    }

    // MARK: Events

    /// A durable `message.reaction.updated` reached this client.
    public func noteLive(messageID: String, eventAt: Date, now: Date = .now) {
        ledger.noteLive(messageID: messageID, eventAt: eventAt, now: now)
    }

    public func addPending(messageID: String, emoji: String, viewerUserID: String, now: Date = .now) {
        self.viewerUserID = viewerUserID
        ledger.addPending(messageID: messageID, emoji: emoji, now: now)
        revision += 1
    }

    public func dropPending(messageID: String, emoji: String) {
        if ledger.dropPending(messageID: messageID, emoji: emoji) { revision += 1 }
    }

    func toggle(messageID: String, sticker: ReactionSticker) {
        onToggle(messageID, sticker.emoji, sticker.isOwn)
    }

    public func toggle(messageID: String, emoji: String, remove: Bool, stampDelay: TimeInterval = 0) {
        if !remove, stampDelay > 0 {
            ownStampDelay[messageID] = (stampDelay, Date.now.addingTimeInterval(stampDelay + 2))
        }
        onToggle(messageID, emoji, remove)
    }

    // MARK: Rows

    /// The pile a row draws: the Server's reactions plus the viewer's
    /// unconfirmed adds.
    func pile(messageID: String, reactions: [MessageReactionPresentation]) -> ReactionPile {
        _ = revision
        return ReactionPile.build(
            reactions: reactions,
            pending: ledger.pending(messageID: messageID, now: .now),
            viewerUserID: viewerUserID
        )
    }

    func stamps(messageID: String) -> [String: ReactionStamp] {
        stamps[messageID] ?? [:]
    }

    /// Called after a row renders a pile. Confirmed pending adds retire, and
    /// any sticker that is new and arrived live starts its stamp.
    func observe(
        messageID: String,
        reactions: [MessageReactionPresentation],
        pile: ReactionPile,
        now: Date = .now
    ) {
        // The Server's copy has landed; the pending own add has done its job.
        for reaction in reactions where reaction.reactors.contains(where: \.isViewer) {
            dropPending(messageID: messageID, emoji: reaction.emoji)
        }
        let fresh = ledger.observe(messageID: messageID, keys: pile.all.map(\.id), now: now)
        let held = fresh.isEmpty ? nil : ownStampDelay.removeValue(forKey: messageID)
        let extra = held.map { $0.until > now ? $0.delay : 0 } ?? 0
        let landing = ReactionStampSchedule.delays(pileOrder: pile.stickers.map(\.id), fresh: fresh)
            .map { (key: $0.key, delay: $0.delay + extra) }
        guard !landing.isEmpty else { return }
        if Self.reducesMotion {
            ReactionHaptics.land(after: 0)
            return
        }
        var next = stamps[messageID] ?? [:]
        for (key, delay) in landing {
            nextToken += 1
            next[key] = ReactionStamp(start: now.addingTimeInterval(delay), token: nextToken)
            ReactionHaptics.land(after: delay + StampMotion.landTime)
        }
        stamps[messageID] = next
        let tokens = next.mapValues(\.token)
        let lastDelay = landing.map(\.delay).max() ?? 0
        Task { [weak self] in
            try? await Task.sleep(for: .seconds(lastDelay + StampMotion.settledTime))
            self?.retire(messageID: messageID, tokens: tokens)
        }
    }

    /// Clears finished stamps unless a newer arrival restarted one.
    private func retire(messageID: String, tokens: [String: Int]) {
        guard var current = stamps[messageID] else { return }
        for (key, token) in tokens where current[key]?.token == token {
            current.removeValue(forKey: key)
        }
        stamps[messageID] = current.isEmpty ? nil : current
    }

    private static var reducesMotion: Bool {
        #if canImport(UIKit)
        UIAccessibility.isReduceMotionEnabled
        #else
        false
        #endif
    }
}

private struct ReactionStickerBoardKey: EnvironmentKey {
    static let defaultValue: ReactionStickerBoard? = nil
}

extension EnvironmentValues {
    /// The session's reaction board. Nil in previews and fixtures, where piles
    /// render at rest and stickers do not toggle.
    public var reactionStickers: ReactionStickerBoard? {
        get { self[ReactionStickerBoardKey.self] }
        set { self[ReactionStickerBoardKey.self] = newValue }
    }
}
