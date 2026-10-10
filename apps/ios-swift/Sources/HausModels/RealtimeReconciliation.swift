import Foundation

/// Start-anchored recovery (specs/realtime-events.md, iPhone impact).
///
/// Nothing replays, so a read that finished before a stream subscribed can
/// miss a commit whose event fired before the subscription existed. Every
/// successful stream start (first connect, transport reconnect, restart after
/// failure) therefore reconciles the projections that stream owns. A
/// projection whose latest landed read began after the start already reflects
/// everything the stream could have missed and is skipped; starts landing
/// together share one pass.
///
/// Ordering uses a private monotonic clock, never wall time, so it is exact
/// on one actor and deterministic in tests.
public struct RealtimeReconciliation: Sendable, Equatable {
    private var clock = 0
    private var landedReadStart: [RealtimeProjection: Int] = [:]
    private var anchors: [RealtimeProjection: Int] = [:]

    public init() {}

    /// Marks a projection read beginning. Pass the tick to `landed`.
    public mutating func beginRead() -> Int {
        tick()
    }

    /// Records a read that succeeded. Returns false when a read that began
    /// later has already landed: the caller drops this older answer.
    @discardableResult
    public mutating func landed(_ projection: RealtimeProjection, readStartedAt start: Int) -> Bool {
        if let newest = landedReadStart[projection], newest > start { return false }
        landedReadStart[projection] = start
        return true
    }

    /// A stream subscription started: its projections need reconciling against
    /// every read that began before now.
    public mutating func streamStarted(reconciling projections: Set<RealtimeProjection>) {
        let anchor = tick()
        for projection in projections {
            anchors[projection] = anchor
        }
    }

    /// Takes the pending projections, skipping each one a read begun after its
    /// latest anchor already answered.
    public mutating func take() -> Set<RealtimeProjection> {
        defer { anchors = [:] }
        return Set(anchors.compactMap { projection, anchor in
            guard let landed = landedReadStart[projection], landed > anchor else { return projection }
            return nil
        })
    }

    /// Streams stopped: nothing pending survives them.
    public mutating func cancelPending() {
        anchors = [:]
    }

    private mutating func tick() -> Int {
        clock += 1
        return clock
    }
}
