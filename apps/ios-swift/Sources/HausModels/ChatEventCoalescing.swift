/// Accumulates live Chat events so a burst of Server notifications produces one
/// read fan-out instead of one per event: an Agent posting a run of messages
/// costs one tail read per list and one Chat list read.
///
/// Live events arrive one SSE frame at a time across several focused streams.
/// Timing stays with the caller: this value owns the buffer and the flush
/// decision alone, so the coalescing rules are testable without a clock.
public struct ChatEventCoalescer<Event: Sendable & Equatable>: Sendable, Equatable {
    /// What the caller must do after buffering an event.
    public enum Decision: Sendable, Equatable {
        /// First event of a window. Start the flush timer.
        case scheduleFlush
        /// A window is already open. Keep accumulating.
        case awaitScheduledFlush
        /// The window reached its batch limit. Cancel the timer and flush now
        /// rather than letting one batch grow without bound.
        case flushNow
    }

    /// Largest batch a single window accumulates before flushing early.
    public let batchLimit: Int
    private var pending: [Event] = []
    private var isWindowOpen = false

    public init(batchLimit: Int = 64) {
        self.batchLimit = max(1, batchLimit)
    }

    public var isEmpty: Bool { pending.isEmpty }
    public var count: Int { pending.count }

    public mutating func buffer(_ event: Event) -> Decision {
        pending.append(event)
        if pending.count >= batchLimit {
            isWindowOpen = false
            return .flushNow
        }
        if isWindowOpen {
            return .awaitScheduledFlush
        }
        isWindowOpen = true
        return .scheduleFlush
    }

    /// Removes and returns everything buffered, closing the current window.
    /// Draining is the only way events leave the buffer, so a teardown can
    /// take the pending batch with it instead of dropping it.
    public mutating func drain() -> [Event] {
        isWindowOpen = false
        let batch = pending
        pending.removeAll(keepingCapacity: true)
        return batch
    }
}
