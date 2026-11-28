#if canImport(UIKit)
import UIKit

/// A transcript keeps its place across a pose change (`PoseCarry`). While
/// mounted it answers where it rests, and one mounted under the same key
/// after the fold comes back to that anchor before the reader touches it.
/// At the newest edge there is nothing to carry: a fresh transcript rests
/// there already.
@MainActor
final class TranscriptPose {
    let carry: PoseCarry
    let key: PoseKey
    let token = UUID()
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
        carry.register(pose.key, token: pose.token) { [weak self] in
            self?.pose?.pendingResume ?? self?.restingAnchor()
        }
        self.pose = pose
    }

    func leavePoseCarry() {
        guard let pose else { return }
        pose.carry.unregister(pose.key, token: pose.token)
    }

    func resumePose(in table: UITableView) {
        guard let anchor = pose?.pendingResume, table.bounds.height > 0,
              items.contains(where: { $0.id == anchor.itemID })
        else { return }
        pose?.pendingResume = nil
        hold(anchor, in: table)
        scheduleNearNewestSync(table)
    }

    private func restingAnchor() -> TranscriptScrollAnchor? {
        guard let table, table.bounds.height > 0,
              !nearNewest.countsAsNear(distance: distanceFromNewest(table))
        else { return nil }
        return TranscriptScrollAnchor.capture(table: table, items: items)
    }
}

#endif
