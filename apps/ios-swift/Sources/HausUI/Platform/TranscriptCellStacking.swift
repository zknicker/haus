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

extension UITableViewCell {
    func stackForReactionStamps(order: Int) {
        layer.zPosition = CGFloat(order)
        // A plain-style cell's default background is opaque and would cut a
        // newer row's stamp off at this row's edge.
        backgroundConfiguration = .clear()
    }
}
#endif
