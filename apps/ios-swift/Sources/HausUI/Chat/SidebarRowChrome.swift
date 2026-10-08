import SwiftUI

/// What the sidebar marks as the screen on display. Only one row at a time
/// wears the selection capsule, and it follows the reader to the Inbox and to
/// Tasks rather than staying on the last Chat they opened.
public enum SidebarSelection: Hashable, Sendable {
    case inbox
    case tasks
    case chat(ChatDestination.ID)
}

/// The geometry every sidebar row shares, scaled with Dynamic Type by the
/// sidebar that owns it, so the Inbox, Tasks, and Chat rows grow together.
struct SidebarRowMetrics {
    /// The common glyph column every row leads with.
    var glyph: CGFloat
    /// A row's minimum height. Rows grow past it when their title wraps.
    var rowHeight: CGFloat
    /// How far a row paints its capsule outside the rail.
    var capsuleBleed: CGFloat
    /// How far the scrolling list is inset from the sidebar's edge.
    var listInset: CGFloat
    /// Whether text-size is an accessibility size, where titles may wrap.
    var isAccessibilitySize: Bool

    /// The press highlight matches the selection capsule's curve at the
    /// resting height instead of drawing square corners.
    var pressRadius: CGFloat { rowHeight / 2 }
    var titleLineLimit: Int { isAccessibilitySize ? 2 : 1 }
}

extension View {
    /// The row's resting frame and its selection capsule.
    func sidebarRowFrame(_ metrics: SidebarRowMetrics, isSelected: Bool) -> some View {
        padding(.horizontal, metrics.capsuleBleed)
            .padding(.vertical, metrics.isAccessibilitySize ? 6 : 0)
            .frame(minHeight: metrics.rowHeight)
            .modifier(SidebarSelectionFill(isSelected: isSelected))
    }
}

private struct SidebarSelectionFill: ViewModifier {
    let isSelected: Bool
    @Environment(\.colorScheme) private var colorScheme

    func body(content: Content) -> some View {
        content
            .background(isSelected ? fill : .clear, in: .capsule)
            .accessibilityAddTraits(isSelected ? .isSelected : [])
    }

    /// Dark mode reads `Color.primary.opacity` too faintly against a near-black
    /// background, so the selected row needs more presence there than light
    /// mode needs.
    private var fill: Color {
        colorScheme == .dark ? Color.primary.opacity(0.12) : Color.primary.opacity(0.045)
    }
}
