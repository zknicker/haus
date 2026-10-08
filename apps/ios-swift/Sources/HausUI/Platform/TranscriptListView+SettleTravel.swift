import SwiftUI
#if canImport(UIKit)
import QuartzCore
import UIKit

/// The travel that carries a settle to the newest edge.
///
/// Each display frame writes the real `contentOffset`, so the table lays out
/// every row the viewport passes over, exactly as a user scroll does. A
/// `UIView.animate` block on `contentOffset` looks the same and is not: it
/// writes the destination immediately and animates only the layer, so the table
/// lays out once, at the destination, and everything travelled through paints
/// blank. UIKit's own `setContentOffset(_:animated:)` lays out correctly but
/// travels to a destination fixed at its start, and the transcript's home moves
/// under a send; `TranscriptSettleTravel` has the account of what that cost.
extension TranscriptListCoordinator {
    /// Opens a settle from wherever the viewport stands now and travels it
    /// home. A settle in flight is replaced, not queued.
    func settleToNewest(table: UITableView) {
        let home = settleHome(table)
        // Replacing a travel keeps any inset it held open: this one starts
        // from the same standing offset.
        guard abs(table.contentOffset.y - home) > 0.5 else {
            endSettling(closingInset: false)
            setTravelOffset(home, in: table)
            scheduleNearNewestSync(table)
            return
        }
        endSettling(closingInset: false)
        let now = CACurrentMediaTime()
        settleTravel = TranscriptSettleTravel(
            ticket: nearNewest.beginSettling(),
            startDistance: table.contentOffset.y - home,
            startTime: now,
            clock: now
        )
        settleLink = TranscriptSettleLink { [weak self, weak table] time in
            guard let self, let table else { return false }
            self.stepSettle(table, at: time)
            return true
        }
    }

    /// Lands the travel's offset for `time` against home as it stands now,
    /// and closes the settle once the curve is spent. An inset write calls
    /// this too, so the frame that moves home also moves the viewport. The
    /// clock never runs backwards: the display link reports the frame's
    /// target time, which is ahead of the moment an inset write arrives.
    func stepSettle(_ table: UITableView, at time: CFTimeInterval = CACurrentMediaTime()) {
        guard var travel = settleTravel else { return }
        travel.clock = max(travel.clock, time)
        settleTravel = travel
        let home = settleHome(table)
        let finished = travel.isFinished(at: travel.clock)
        setTravelOffset(finished ? home : travel.offset(home: home, at: travel.clock), in: table)
        guard finished else { return }
        guard nearNewest.endSettling(travel.ticket) else { return }
        stopSettleTravel()
        scheduleNearNewestSync(table)
    }

    /// Writes a travel's offset. One that starts past the newest edge — the
    /// composer collapsing by more than a send's row adds — would be clamped
    /// by UIKit on its next layout, so the inset is held open to it; it closes
    /// back to the screen's inset as the travel arrives home.
    func setTravelOffset(_ offset: CGFloat, in table: UITableView) {
        let top = max(appliedInsets?.top ?? table.contentInset.top, -offset)
        // Whichever write keeps the offset inside the inset goes first, so
        // UIKit has nothing to clamp in between.
        if top < table.contentInset.top {
            writeOffset(offset, in: table)
            table.contentInset.top = top
        } else {
            if top > table.contentInset.top { table.contentInset.top = top }
            writeOffset(offset, in: table)
        }
    }

    private func writeOffset(_ offset: CGFloat, in table: UITableView) {
        guard abs(table.contentOffset.y - offset) > 0.01 else { return }
        table.contentOffset.y = offset
    }

    /// Ends any settle in flight — a drag taking the viewport, or a snap that
    /// jumps straight to the newest edge — and orphans its ticket. An inset a
    /// travel held open closes; a drag rubber-bands back inside it.
    func endSettling(closingInset: Bool = true) {
        nearNewest.endSettling()
        stopSettleTravel()
        guard closingInset else { return }
        if let table, let top = appliedInsets?.top, abs(table.contentInset.top - top) > 0.01 {
            table.contentInset.top = top
        }
    }

    private func stopSettleTravel() {
        settleTravel = nil
        settleLink?.invalidate()
        settleLink = nil
    }
}

/// A display link that reports each frame's target time to a closure, until the
/// closure answers false. The coordinator is generic, so the link's Objective-C
/// target lives here.
@MainActor
final class TranscriptSettleLink: NSObject {
    private var link: CADisplayLink?
    private let onFrame: (CFTimeInterval) -> Bool

    init(onFrame: @escaping (CFTimeInterval) -> Bool) {
        self.onFrame = onFrame
        super.init()
        let link = CADisplayLink(target: self, selector: #selector(frame(_:)))
        link.add(to: .main, forMode: .common)
        self.link = link
    }

    func invalidate() {
        link?.invalidate()
        link = nil
    }

    @objc private func frame(_ link: CADisplayLink) {
        if !onFrame(link.targetTimestamp) { invalidate() }
    }
}

#endif
