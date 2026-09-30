#if canImport(UIKit)
import UIKit

/// A transcript row's cell. A reaction stamp falls from eight times its size,
/// far past its own row, so nothing between the table and the hosted row may
/// clip it, and newer rows stack over older ones so the fall lands on top of
/// the messages above.
final class TranscriptCell: UITableViewCell {
    override func layoutSubviews() {
        super.layoutSubviews()
        // The hosting configuration builds its views lazily, so the unclip
        // follows every layout rather than the configure call.
        Self.unclip(self)
    }

    /// Unclips the hosting chain only. A view that clips for its own sake —
    /// any scroll view (image strips, code and table scrollers, text views,
    /// web views) or a rounded or masked layer — keeps its clip, and nothing
    /// under it is touched.
    private static func unclip(_ view: UIView) {
        guard !(view is UIScrollView), view.layer.cornerRadius == 0, view.layer.mask == nil else { return }
        view.clipsToBounds = false
        for subview in view.subviews { unclip(subview) }
    }
}

extension TranscriptCell {
    /// The long-press lift for a row: its content on an opaque card with a
    /// continuous corner, the way Mail and Slack lift rows that have no
    /// bubble of their own. A clear preview background let the dimmed
    /// transcript show through the lift, which read as a translucent sheet.
    ///
    /// The row is flipped with the table, so it is snapshotted with
    /// `layer.render`, which composites the subtree without the root layer's
    /// own transform and so yields an upright image (`drawHierarchy` bakes the
    /// flip in). The target is anchored in the table's unflipped superview so
    /// the container cannot flip it back.
    static func liftedPreview(of content: UIView, in container: UIView) -> UITargetedPreview {
        let image = UIGraphicsImageRenderer(bounds: content.bounds).image { context in
            content.layer.render(in: context.cgContext)
        }
        let card = UIView(frame: content.bounds.insetBy(dx: liftInset.width, dy: -liftInset.height))
        let snapshot = UIImageView(image: image)
        snapshot.frame.origin = CGPoint(x: -liftInset.width, y: liftInset.height)
        card.addSubview(snapshot)
        card.clipsToBounds = true

        let parameters = UIPreviewParameters()
        // The chat's own surface, at the elevated level a lifted card sits at.
        parameters.backgroundColor = .systemBackground.resolvedColor(
            with: content.traitCollection.modifyingTraits { $0.userInterfaceLevel = .elevated }
        )
        parameters.visiblePath = UIBezierPath(roundedRect: card.bounds, cornerRadius: 18)
        let center = content.convert(CGPoint(x: content.bounds.midX, y: content.bounds.midY), to: container)
        return UITargetedPreview(
            view: card,
            parameters: parameters,
            target: UIPreviewTarget(container: container, center: center)
        )
    }

    /// Card margin: a little in from the screen edges, a little air above and below.
    private static let liftInset = CGSize(width: 6, height: 10)
}

extension UITableViewCell {
    func stackForReactionStamps(order: Int) {
        layer.zPosition = CGFloat(order)
        // A plain-style cell's default background is opaque and would cut a
        // newer row's stamp off at this row's edge.
        backgroundConfiguration = .clear()
    }
}
#endif
