#if canImport(UIKit)
import UIKit

/// A transcript keeps its place across a pose change (`PoseCarry`). It notes
/// where it rests each time a scroll settles, outside any SwiftUI update, so
/// a pose change only reads that note; one mounted under the same key after
/// the fold comes back to it before the reader touches it. At the newest edge
/// there is nothing to carry: a fresh transcript rests there already.
@MainActor
final class TranscriptPose {
    let carry: PoseCarry
    let key: PoseKey
    let token = UUID()
    var resting: TranscriptScrollAnchor?
    var pendingResume: TranscriptScrollAnchor?

    init(carry: PoseCarry, key: PoseKey) {
        self.carry = carry
        self.key = key
    }
}

extension TranscriptListCoordinator {
    func joinPoseCarry(_ carry: PoseCarry?, scope: String) {
        guard let carry, !scope.isEmpty, pose == nil else { return }
        let pose = TranscriptPose(carry: carry, key: PoseKey(scope: scope, name: "transcript"))
        pose.pendingResume = carry.take(pose.key, as: TranscriptScrollAnchor.self)
        carry.register(pose.key, token: pose.token) { [weak pose] in pose?.pendingResume ?? pose?.resting }
        self.pose = pose
    }

    func leavePoseCarry() {
        guard let pose else { return }
        pose.carry.unregister(token: pose.token)
    }

    func resumePose(in table: UITableView) {
        guard let anchor = pose?.pendingResume, table.bounds.height > 0,
              items.contains(where: { $0.id == anchor.itemID })
        else { return }
        pose?.pendingResume = nil
        hold(anchor, in: table)
        pose?.resting = anchor
        scheduleNearNewestSync(table)
    }

    /// Called when a drag, a fling or a scroll animation comes to rest.
    func noteRestingAnchor(_ table: UITableView) {
        guard let pose, table.bounds.height > 0 else { return }
        pose.resting = nearNewest.countsAsNear(distance: distanceFromNewest(table))
            ? nil
            : TranscriptScrollAnchor.capture(table: table, items: items)
    }
}

#endif
