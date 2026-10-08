import SwiftUI

enum HausChrome {
    /// Every chrome row is this tall, so a chrome button in the sidebar and one
    /// on the Chat canvas land on the same centerline.
    static let headerHeight: CGFloat = 56

    /// Extra bar region below the chrome row, reserved purely as runway for the
    /// system's scroll edge effect.
    ///
    /// The effect has no strength: the public surface is three named styles, and
    /// `.hard` is an opaque cap with a dividing line rather than a deeper fade.
    /// What it does have is reach — iOS 26 ramps the dissolve across the bar
    /// region it was given, so a taller bar is a longer ramp. Over the chrome row
    /// alone the ramp is barely a line tall and a passing row stays readable
    /// under the header; this much runway takes that row down to roughly a
    /// seventh of its contrast while leaving the first row below the chrome
    /// fully crisp. More runway starts softening that row too, which is the
    /// wrong trade — the point is a decisive dissolve, not a taller cap.
    static let scrollEdgeRunway: CGFloat = 28

    /// Clearance the transcript holds between its newest row and the composer's
    /// reserved region, applied as the list's own scroll bound rather than as
    /// composer padding. It runs wider than the 16-point inter-message rhythm on
    /// purpose: the composer's glass rim sits inside the region it reserves, so a
    /// gap merely equal to the rhythm reads as the newest message crowding the
    /// chrome instead of resting above it.
    static let transcriptBottomRunway: CGFloat = 28
}

/// The shared app-chrome header row.
///
/// Chat and Settings place their chrome buttons through this row so leading,
/// centered, and trailing chrome share one height and one inset on every screen.
struct ChromeHeader<Leading: View, Center: View, Trailing: View>: View {
    private let inset: CGFloat
    @ViewBuilder private let leading: () -> Leading
    @ViewBuilder private let center: () -> Center
    @ViewBuilder private let trailing: () -> Trailing

    init(
        inset: CGFloat = 16,
        @ViewBuilder leading: @escaping () -> Leading,
        @ViewBuilder center: @escaping () -> Center,
        @ViewBuilder trailing: @escaping () -> Trailing
    ) {
        self.inset = inset
        self.leading = leading
        self.center = center
        self.trailing = trailing
    }

    var body: some View {
        ChromeHeaderLayout(spacing: 12) {
            leading().layoutValue(key: ChromeHeaderSlot.self, value: .leading)
            center().layoutValue(key: ChromeHeaderSlot.self, value: .center)
            trailing().layoutValue(key: ChromeHeaderSlot.self, value: .trailing)
        }
        .padding(.horizontal, inset)
        .frame(minHeight: HausChrome.headerHeight)
        // Bars do not grow with text size past the largest standard size, the
        // way the system navigation bar does; past it a title would push the
        // chrome buttons out of the row.
        .dynamicTypeSize(...DynamicTypeSize.xxxLarge)
    }
}

/// Which slot of a ``ChromeHeader`` a subview fills. An `EmptyView` slot
/// produces no subview at all, so slots are found by tag, not by position.
enum ChromeHeaderSlot: LayoutValueKey {
    enum Slot { case leading, center, trailing }
    static let defaultValue = Slot.center
}

/// Leading and trailing chrome hug their edges; the center is truly centered
/// and is offered only the width between equal side gutters, so a long title
/// truncates instead of sliding under a chrome button. Without a center, the
/// leading item takes whatever the trailing one leaves.
struct ChromeHeaderLayout: Layout {
    var spacing: CGFloat

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width ?? subviews.reduce(0) { $0 + $1.sizeThatFits(.unspecified).width }
        let frames = proposals(width: width, subviews: subviews)
        let height = frames.map { subviews[$0.index].sizeThatFits($0.proposal).height }.max() ?? 0
        return CGSize(width: width, height: height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        for frame in proposals(width: bounds.width, subviews: subviews) {
            let subview = subviews[frame.index]
            switch subview[ChromeHeaderSlot.self] {
            case .leading:
                subview.place(at: CGPoint(x: bounds.minX, y: bounds.midY), anchor: .leading, proposal: frame.proposal)
            case .center:
                subview.place(at: CGPoint(x: bounds.midX, y: bounds.midY), anchor: .center, proposal: frame.proposal)
            case .trailing:
                subview.place(at: CGPoint(x: bounds.maxX, y: bounds.midY), anchor: .trailing, proposal: frame.proposal)
            }
        }
    }

    private func proposals(
        width: CGFloat,
        subviews: Subviews
    ) -> [(index: Int, proposal: ProposedViewSize)] {
        func index(_ slot: ChromeHeaderSlot.Slot) -> Int? {
            subviews.indices.first { subviews[$0][ChromeHeaderSlot.self] == slot }
        }
        let leading = index(.leading)
        let center = index(.center)
        let trailing = index(.trailing)
        let trailingWidth = trailing.map { subviews[$0].sizeThatFits(.unspecified).width } ?? 0
        var result: [(Int, ProposedViewSize)] = []
        if let trailing { result.append((trailing, .unspecified)) }

        if let center {
            let leadingWidth = leading.map { subviews[$0].sizeThatFits(.unspecified).width } ?? 0
            let gutter = max(leadingWidth, trailingWidth)
            let centerWidth = max(0, width - 2 * (gutter + (gutter > 0 ? spacing : 0)))
            if let leading { result.append((leading, .unspecified)) }
            result.append((center, ProposedViewSize(width: centerWidth, height: nil)))
        } else if let leading {
            let available = max(0, width - trailingWidth - (trailing == nil ? 0 : spacing))
            result.append((leading, ProposedViewSize(width: available, height: nil)))
        }
        return result
    }
}

extension View {
    /// Attaches floating chrome to a scrolling view's edge as a *bar*.
    ///
    /// iOS 26 paints its scroll edge effect only behind content the scroll view
    /// knows is a bar. `safeAreaInset` reserves the room without claiming it, so
    /// `scrollEdgeEffectStyle` had no region to soften: the transcript ran
    /// razor-sharp into the status bar and the glass header sat over raw text.
    /// `safeAreaBar` reserves the same room and marks it, which is what puts the
    /// scrim back under the chrome.
    ///
    /// The bar is also deliberately taller than the chrome it carries, because
    /// the region is what sets how far the dissolve ramps —
    /// ``HausChrome/scrollEdgeRunway`` explains the trade. Pre-26 has no edge
    /// effect at all, so it gets neither the bar nor the runway: there the plain
    /// inset is the whole behavior and the extra room would only be dead space.
    @ViewBuilder
    func chromeBar<Content: View>(
        edge: VerticalEdge,
        spacing: CGFloat? = nil,
        @ViewBuilder content: () -> Content
    ) -> some View {
        if #available(iOS 26, macOS 26, *) {
            safeAreaBar(edge: edge, spacing: spacing) {
                content()
                    .padding(edge == .top ? .bottom : .top, HausChrome.scrollEdgeRunway)
                    .background { if edge == .top { ChromeScrollEdge() } }
            }
        } else {
            safeAreaInset(edge: edge, spacing: spacing) {
                content()
                    .background { if edge == .top { ChromeScrollEdge() } }
            }
        }
    }
}

/// The frosted edge under top chrome: the status bar and the chrome row sit on
/// the bar material, which then feathers out across the runway below them.
///
/// The system soft edge only dims what scrolls under a bar, and on a
/// transcript the dissolve is a mask over the rows themselves; either way a
/// passing line of body text stayed legible behind the clock, a floating title,
/// and the chrome buttons, and read as two layers of text colliding. Blurring
/// the region is what the system navigation bar does, so the title and the
/// buttons always sit on a quiet ground, while the feathered bottom keeps the
/// header floating rather than capping the screen with a hard edge.
struct ChromeScrollEdge: View {
    var body: some View {
        Rectangle()
            .fill(.bar)
            .mask {
                LinearGradient(
                    stops: [
                        .init(color: .black, location: 0),
                        .init(color: .black, location: 0.62),
                        .init(color: .black.opacity(0), location: 1),
                    ],
                    startPoint: .top,
                    endPoint: .bottom
                )
            }
            .ignoresSafeArea(edges: .top)
            .allowsHitTesting(false)
            .accessibilityHidden(true)
    }
}

extension View {
    /// The transcript's soft top edge: rows dissolve as they pass under the
    /// chrome, the way the system scroll edge effect painted for a SwiftUI
    /// scroll view. The system effect computes its region from safe areas the
    /// flipped transcript table does not have, so the dissolve is a mask —
    /// same ramp shape as the iOS 26 soft edge, on every iOS version. Rows
    /// are crisp below the bar, at roughly a seventh of their contrast behind
    /// the chrome row, and gone by the status bar.
    ///
    /// `safeAreaTop` is the full reserved top region: status bar, chrome row,
    /// and runway.
    func transcriptTopDissolve(safeAreaTop: CGFloat) -> some View {
        mask {
            VStack(spacing: 0) {
                LinearGradient(
                    stops: [
                        .init(color: .black.opacity(0), location: 0),
                        .init(color: .black.opacity(0.05), location: 0.4),
                        .init(color: .black.opacity(0.15), location: 0.8),
                        .init(color: .black, location: 1),
                    ],
                    startPoint: .top,
                    endPoint: .bottom
                )
                .frame(height: safeAreaTop)
                Color.black
            }
            .ignoresSafeArea()
        }
    }
}

extension ChromeHeader where Center == EmptyView {
    init(
        inset: CGFloat = 16,
        @ViewBuilder leading: @escaping () -> Leading,
        @ViewBuilder trailing: @escaping () -> Trailing
    ) {
        self.init(inset: inset, leading: leading, center: { EmptyView() }, trailing: trailing)
    }
}
