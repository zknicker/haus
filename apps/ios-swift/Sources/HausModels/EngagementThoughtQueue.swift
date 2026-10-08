import Foundation

/// Which thought bubble the Chat header shows, and which wait their turn.
///
/// Several Agents can think at once in a channel, but the header has room for
/// one bubble. Bubbles take turns and never overlap: each holds for `dwell`,
/// yields after `minimumDwell` when another is waiting, and leaves `gap` free
/// for its exit before the next drops in. A backlog never builds, because only
/// an Agent's latest waiting thought is kept, in the place its first one took,
/// so the queue is at most one line per Agent and every Agent gets its turn.
///
/// Times are a monotonic clock the caller supplies; the type is a pure state
/// machine, and the caller wakes it at `nextWake`.
public struct EngagementThoughtQueue: Sendable, Equatable {
    /// How long a bubble stays when nothing else is waiting.
    public static let dwell: TimeInterval = 2.2
    /// The shortest a bubble stays before a waiting one may replace it.
    public static let minimumDwell: TimeInterval = 1.5
    /// Room for the leaving bubble's exit before the next one enters.
    public static let gap: TimeInterval = 0.35

    public struct Bubble: Sendable, Equatable {
        public let thought: ChatTypingThought
        public let shownAt: TimeInterval
    }

    public private(set) var current: Bubble?
    /// One waiting thought per Agent, in turn order.
    public private(set) var pending: [ChatTypingThought] = []
    private var lastHiddenAt: TimeInterval?

    public init() {}

    /// A new thought. The same words as the bubble already up from the same
    /// Agent add nothing; anything else waits, replacing that Agent's older
    /// waiting line without losing its place.
    public mutating func receive(_ thought: ChatTypingThought, now: TimeInterval) {
        advance(now: now)
        if let current, current.thought.agentID == thought.agentID,
           ChatTypingThought.normalized(current.thought.text)
            == ChatTypingThought.normalized(thought.text) {
            return
        }
        if let index = pending.firstIndex(where: { $0.agentID == thought.agentID }) {
            pending[index] = thought
        } else {
            pending.append(thought)
        }
        advance(now: now)
    }

    /// Retires the bubble whose time is up and shows the next waiting one
    /// once the exit gap has passed.
    public mutating func advance(now: TimeInterval) {
        if let current, now >= hideAt(current) {
            self.current = nil
            lastHiddenAt = now
        }
        guard current == nil, !pending.isEmpty else { return }
        if let lastHiddenAt, now < lastHiddenAt + Self.gap { return }
        current = Bubble(thought: pending.removeFirst(), shownAt: now)
    }

    /// Keeps only what still belongs on screen. A waiting thought needs its
    /// run still engaging the Chat. The bubble already up may also stay for a
    /// held Agent — one whose `--done` reply has not reached the transcript —
    /// so the header does not drop a line while the Agent is still in its row.
    public mutating func retain(
        engaged: (_ agentID: String, _ runID: String) -> Bool,
        held: (_ agentID: String, _ runID: String) -> Bool,
        now: TimeInterval
    ) {
        pending.removeAll { !engaged($0.agentID, $0.runID) }
        if let current {
            let thought = current.thought
            if !engaged(thought.agentID, thought.runID), !held(thought.agentID, thought.runID) {
                self.current = nil
                lastHiddenAt = now
            }
        }
        advance(now: now)
    }

    /// When the caller should call `advance` next, or nil when nothing waits.
    public var nextWake: TimeInterval? {
        if let current { return hideAt(current) }
        guard !pending.isEmpty else { return nil }
        return (lastHiddenAt ?? 0) + Self.gap
    }

    private func hideAt(_ bubble: Bubble) -> TimeInterval {
        bubble.shownAt + (pending.isEmpty ? Self.dwell : Self.minimumDwell)
    }
}
