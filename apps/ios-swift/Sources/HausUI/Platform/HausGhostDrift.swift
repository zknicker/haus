import SwiftUI

/// How fast the mesh reorganizes. `lively` runs the same loops 2.5x faster by
/// scaling every period — and the tick grid with them — by the same fraction.
public enum HausGhostTempo: Sendable {
    case calm
    case lively

    var multiplier: Double {
        switch self {
        case .calm: 1
        case .lively: 0.4
        }
    }
}

/// One drifting color blob: where the icon puts it, and the ellipse it travels.
struct HausGhostBlob: Sendable {
    let color: Color
    let center: CGPoint
    let radius: CGFloat
    let opacity: Double
    /// Seconds for one lap at `calm`.
    let period: Double
    /// Steps *per keyframe interval*, the way CSS `steps(n, end)` reads.
    let steps: Int
    /// The translate offsets the loop passes through, first repeated last.
    let keyframes: [CGSize]
}

/// Stepped, not continuous, and every loop stepped on one shared grid — that is
/// the whole performance story of this mark.
///
/// The blobs drift inside a Gaussian blur nested in two masks and a clip, so
/// every distinct transform re-runs that filter chain. What costs is the number
/// of frames the mark redraws on, not how much changed in one of them, so all
/// three loops land on the same 0.3s grid: every period is a whole number of
/// ticks, so the mark repaints 3.3 times a second whether one blob moved or all
/// three did. The periods are 20, 28 and 16 ticks, so the three loops only
/// return to the same phase every three minutes.
///
/// Every offset here is a pure function of elapsed seconds, which is what lets
/// the view freeze the drift in place — it stops advancing the phase rather
/// than stopping an animation that would snap back to its start.
public enum HausGhostDrift {
    /// The shared grid, in seconds. `TimelineView` ticks on exactly this, so
    /// the canvas never redraws between steps.
    static let tick: Double = 0.3

    static func tick(for tempo: HausGhostTempo) -> Double {
        tick * tempo.multiplier
    }

    /// Azure at the upper right, rose along the lower-right contour, and only a
    /// soft violet where the two would otherwise mix to gray — the icon's
    /// arrangement. Each loop is bounded by its blob's own quadrant, so that
    /// arrangement holds at every phase and not just at rest. Violet runs the
    /// other way round its ellipse, so the three never sweep as a group.
    static let blobs: [HausGhostBlob] = [
        HausGhostBlob(
            color: HausGhostPalette.meshAzure,
            center: CGPoint(x: 154, y: 68),
            radius: 50,
            opacity: 0.78,
            period: 6,
            steps: 5,
            keyframes: ellipse(x: 36, y: 14, quarterX: -13, quarterY: 39)
        ),
        HausGhostBlob(
            color: HausGhostPalette.meshViolet,
            center: CGPoint(x: 110, y: 142),
            radius: 39,
            opacity: 0.66,
            period: 8.4,
            steps: 7,
            keyframes: ellipse(x: -50, y: -15, quarterX: -18, quarterY: 41)
        ),
        HausGhostBlob(
            color: HausGhostPalette.meshRose,
            center: CGPoint(x: 163, y: 187),
            radius: 42,
            opacity: 0.74,
            period: 4.8,
            steps: 4,
            keyframes: ellipse(x: -15, y: -33, quarterX: 41, quarterY: -12)
        ),
    ]

    /// Where every blob stands at `phase` seconds into the drift.
    static func offsets(atPhase phase: Double, tempo: HausGhostTempo) -> [CGSize] {
        blobs.map { offset(of: $0, atPhase: phase, tempo: tempo) }
    }

    /// CSS `steps(n, end)` holds the value at the start of each step and jumps
    /// at its end, so a position is the keyframe interval's lower bound plus a
    /// whole number of nths — never a smooth interpolation.
    static func offset(of blob: HausGhostBlob, atPhase phase: Double, tempo: HausGhostTempo) -> CGSize {
        let period = blob.period * tempo.multiplier
        let segments = blob.keyframes.count - 1
        guard period > 0, segments > 0, blob.steps > 0 else { return .zero }

        let totalTicks = segments * blob.steps
        let wrapped = phase.truncatingRemainder(dividingBy: period)
        let elapsed = wrapped < 0 ? wrapped + period : wrapped
        let index = min(totalTicks - 1, Int((elapsed / period * Double(totalTicks)).rounded(.down)))
        let from = blob.keyframes[index / blob.steps]
        let to = blob.keyframes[index / blob.steps + 1]
        let held = Double(index % blob.steps) / Double(blob.steps)

        return CGSize(
            width: from.width + (to.width - from.width) * held,
            height: from.height + (to.height - from.height) * held
        )
    }

    /// The four corners of one loop, first repeated last. An ellipse is the
    /// shape that keeps the color moving: a there-and-back path spends its time
    /// near the ends, where nothing is changing.
    private static func ellipse(
        x: CGFloat,
        y: CGFloat,
        quarterX: CGFloat,
        quarterY: CGFloat
    ) -> [CGSize] {
        [
            CGSize(width: x, height: y),
            CGSize(width: quarterX, height: quarterY),
            CGSize(width: -x, height: -y),
            CGSize(width: -quarterX, height: -quarterY),
            CGSize(width: x, height: y),
        ]
    }
}

/// Ticks the canvas on the drift grid while the mark is drifting, and emits a
/// single entry when it is not — so a paused mark costs nothing and holds the
/// frame it was on rather than snapping back to the loop's start.
struct HausGhostDriftSchedule: TimelineSchedule {
    let tick: Double
    let isRunning: Bool

    func entries(from startDate: Date, mode: TimelineScheduleMode) -> AnyIterator<Date> {
        guard isRunning, tick > 0 else {
            var delivered = false
            return AnyIterator {
                guard !delivered else { return nil }
                delivered = true
                return startDate
            }
        }

        var next = startDate
        return AnyIterator {
            defer { next = next.addingTimeInterval(tick) }
            return next
        }
    }
}
