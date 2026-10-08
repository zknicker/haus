import CoreGraphics
import Foundation

/// One programmatic travel to the transcript's newest edge, held as a distance
/// from home that decays along a fixed curve.
///
/// Home is not part of the travel. Each frame reads it live and lands the
/// viewport at `home + remaining distance`, so a home that moves mid-flight —
/// the composer collapsing after a send, the keyboard leaving, a followed reply
/// growing — carries the travel with it instead of interrupting it. The UIKit
/// animated scroll this replaces travelled to a fixed destination: an inset
/// write cancelled it outright, and a row replaced under it (a send confirmed
/// under its Server id) restarted it from an offset it had never visited, which
/// threw the viewport a couple of messages away from the newest row and eased it
/// back.
struct TranscriptSettleTravel: Equatable {
    /// About UIKit's own animated-scroll duration, so a send eases in as it
    /// always has.
    static let duration: TimeInterval = 0.3

    let ticket: TranscriptNearNewest.SettleTicket
    /// Offset minus home when the travel began. Positive starts away from the
    /// newest edge; negative starts past it, when the home moved further than
    /// the content grew.
    let startDistance: CGFloat
    let startTime: TimeInterval
    /// The latest time this travel has been stepped to; see
    /// `TranscriptListCoordinator.stepSettle`.
    var clock: TimeInterval

    /// The offset this travel puts the viewport at, given where home is now.
    func offset(home: CGFloat, at time: TimeInterval) -> CGFloat {
        home + startDistance * CGFloat(1 - Self.progress(elapsed: time - startTime))
    }

    func isFinished(at time: TimeInterval) -> Bool {
        time - startTime >= Self.duration
    }

    /// The share of the start distance already travelled. A blend of an
    /// ease-out and a smoothstep: it leaves promptly, as the composer it rides
    /// with does, without a velocity step on the first frame, and arrives with
    /// none.
    static func progress(elapsed: TimeInterval) -> Double {
        let t = min(max(elapsed / duration, 0), 1)
        let easeOut = 1 - pow(1 - t, 3)
        let smoothstep = t * t * (3 - 2 * t)
        return (easeOut + smoothstep) / 2
    }
}
