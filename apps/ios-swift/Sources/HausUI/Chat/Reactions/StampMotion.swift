import CoreGraphics
import Foundation

/// The stamp's curve, sampled by time — the App's `reaction-stamp` keyframes.
///
/// Fades in at 8× over the first 10%, falls on an accelerating curve to 1× at
/// 44% (the landing frame), squashes, rebounds, and settles. Sampled rather
/// than animated so a recycled cell, or a row re-rendered mid-flight, picks
/// the stamp up at the right frame.
enum StampMotion {
    static let duration: TimeInterval = 0.65
    /// The landing frame, where the row thuds and the dust goes off.
    static let landTime: TimeInterval = 0.29
    /// When the last dust puff has faded and the stamp can be forgotten.
    static let settledTime: TimeInterval = landTime + 0.08 + 0.85 + 0.1

    struct Pose: Equatable {
        var scaleX: Double
        var scaleY: Double
        /// Degrees added to the sticker's resting tilt.
        var rotation: Double
        var opacity: Double

        static let rest = Pose(scaleX: 1, scaleY: 1, rotation: 0, opacity: 1)
    }

    static func pose(at elapsed: TimeInterval) -> Pose {
        guard elapsed >= 0 else { return Pose(scaleX: 8, scaleY: 8, rotation: -18, opacity: 0) }
        let t = elapsed / duration
        switch t {
        case ..<0.10:
            let p = CubicBezier.easeOut.value(t / 0.10)
            let scale = lerp(8, 7.02, p)
            return Pose(scaleX: scale, scaleY: scale, rotation: lerp(-18, -14, p), opacity: p)
        case ..<0.44:
            let p = CubicBezier.accelerate.value((t - 0.10) / 0.34)
            let scale = lerp(7.02, 1, p)
            return Pose(scaleX: scale, scaleY: scale, rotation: lerp(-14, 0, p), opacity: 1)
        case ..<0.52:
            let p = CubicBezier.easeOut.value((t - 0.44) / 0.08)
            return Pose(scaleX: lerp(1, 1.22, p), scaleY: lerp(1, 0.76, p), rotation: 0, opacity: 1)
        case ..<0.70:
            let p = CubicBezier.ease.value((t - 0.52) / 0.18)
            return Pose(scaleX: lerp(1.22, 0.94, p), scaleY: lerp(0.76, 1.07, p), rotation: 0, opacity: 1)
        case ..<1:
            let p = CubicBezier.ease.value((t - 0.70) / 0.30)
            return Pose(scaleX: lerp(0.94, 1, p), scaleY: lerp(1.07, 1, p), rotation: 0, opacity: 1)
        default:
            return .rest
        }
    }

    /// The row's 2pt dip after a landing: down, a hair back up, settled.
    static func thudOffset(sinceLanding elapsed: TimeInterval) -> Double {
        let length: TimeInterval = 0.25
        guard elapsed > 0, elapsed < length else { return 0 }
        let p = CubicBezier.easeOut.value(elapsed / length)
        switch p {
        case ..<0.3: return lerp(0, 2, p / 0.3)
        case ..<0.6: return lerp(2, -1, (p - 0.3) / 0.3)
        default: return lerp(-1, 0, (p - 0.6) / 0.4)
        }
    }

    static func lerp(_ from: Double, _ to: Double, _ progress: Double) -> Double {
        from + (to - from) * progress
    }
}

/// A CSS `cubic-bezier()` timing function, solved for progress by bisection.
struct CubicBezier: Sendable {
    let x1: Double, y1: Double, x2: Double, y2: Double

    static let ease = CubicBezier(x1: 0.25, y1: 0.1, x2: 0.25, y2: 1)
    static let easeOut = CubicBezier(x1: 0, y1: 0, x2: 0.58, y2: 1)
    static let accelerate = CubicBezier(x1: 0.55, y1: 0, x2: 1, y2: 0.45)
    static let puff = CubicBezier(x1: 0.12, y1: 0.8, x2: 0.3, y2: 1)
    static let speck = CubicBezier(x1: 0.1, y1: 0.9, x2: 0.3, y2: 1)

    func value(_ x: Double) -> Double {
        guard x > 0 else { return 0 }
        guard x < 1 else { return 1 }
        var low = 0.0, high = 1.0, t = x
        for _ in 0..<24 {
            t = (low + high) / 2
            if Self.sample(t, x1, x2) < x { low = t } else { high = t }
        }
        return Self.sample(t, y1, y2)
    }

    private static func sample(_ t: Double, _ a: Double, _ b: Double) -> Double {
        let u = 1 - t
        return 3 * u * u * t * a + 3 * u * t * t * b + t * t * t
    }
}
