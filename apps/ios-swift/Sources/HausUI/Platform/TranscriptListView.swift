import SwiftUI
#if canImport(UIKit)
import UIKit
#endif

#if canImport(UIKit)

/// The bottom-anchored transcript substrate: a `UITableView` flipped with
/// `scaleY(-1)`, rows flipped back, data reversed so the newest item is row 0.
///
/// This is the mechanism production chat lists use instead of SwiftUI's
/// scroll-position primitives, and the reason is structural: the resting state
/// of this list is `contentOffset == -contentInset.top`, the scroll view's own
/// clamped origin. There is no bottom edge to resolve against in-flight layout
/// numbers, so the stranded-viewport class of bug — a transcript blank until
/// dragged, or strobing while assertions fight lazy estimation — cannot occur.
/// Measurement error is pushed to the far (visually top) end where it is
/// invisible, history prepends land beyond the viewport without moving it, and
/// a growing bottom inset (composer, keyboard) lifts the resting viewport with
/// the newest message still visible.
struct TranscriptListView<Item: Identifiable & Equatable, Row: View, Accessory: View>: UIViewRepresentable
where Item.ID == String {
    /// Chronological, oldest first — the same order the product stores.
    let items: [Item]
    /// Visual-top clearance (the chat header bar).
    let topInset: CGFloat
    /// Visual-bottom clearance (the composer, plus the keyboard when open).
    let bottomInset: CGFloat
    /// Shown past the oldest item (visual top); used for history loading.
    let showsAccessory: Bool
    /// Decides the viewport's reaction to newer items arriving at the tail.
    let onAppend: (_ previousItems: [Item], _ items: [Item], _ isNearNewest: Bool) -> TranscriptAppendBehavior
    let reveal: TranscriptReveal?
    @Binding var isNearNewest: Bool
    /// it to put the keyboard away. Scrolls and row controls are unaffected.
    var onContentTap: (() -> Void)? = nil
    /// The ids of the rows currently in the viewport, newest first, published
    /// once per runloop turn from settled geometry and only when the set
    /// changes. This is what read acknowledgement is built on: the transcript
    /// knows what it is showing, and nothing above it can infer that from a
    /// loaded page.
    var onVisibleItems: (([String]) -> Void)? = nil
    /// Plays the app-opening settle (rise and fade, matching
    /// `OpeningEntranceSection.timeline`) once on mount. Owned here in UIKit
    /// because a SwiftUI opacity animation over a platform view can be dropped
    /// mid-flight by the table's own layout, freezing the fade partway.
    var animatesEntrance = false
    /// A long press on a row, which opens the screen's message drawer; nil
    /// means rows take no long press.
    var onLongPress: ((Item) -> Void)? = nil
    /// The row a resting finger is holding, reported a beat before the long
    /// press lands so the screen can tint it; nil once the finger lifts,
    /// drifts off the row, or the transcript scrolls. A tap never reports.
    /// Only installed alongside `onLongPress`.
    var onHoldChange: ((Item?) -> Void)? = nil
    /// Everything rows and the accessory draw from beyond their own item —
    /// a press tint, a registry's revision. Rows are re-hosted only when their
    /// item changes or this does, so an inset-only update re-hosts nothing.
    var rowRevision = 0
    @ViewBuilder let row: (Item) -> Row
    @ViewBuilder let accessory: () -> Accessory

    func makeUIView(context: Context) -> UITableView {
        let table = UITableView(frame: .zero, style: .plain)
        table.transform = CGAffineTransform(scaleX: 1, y: -1)
        table.separatorStyle = .none
        table.backgroundColor = .clear
        table.allowsSelection = false
        table.contentInsetAdjustmentBehavior = .never
        table.automaticallyAdjustsScrollIndicatorInsets = false
        table.insetsContentViewsToSafeArea = false
        table.preservesSuperviewLayoutMargins = false
        table.cellLayoutMarginsFollowReadableWidth = false
        table.scrollsToTop = false
        table.keyboardDismissMode = .interactive
        table.rowHeight = UITableView.automaticDimension
        table.estimatedRowHeight = 72
        table.register(TranscriptCell.self, forCellReuseIdentifier: "row")
        table.dataSource = context.coordinator
        table.delegate = context.coordinator
        // The system scroll edge effect computes its region from safe
        // areas the flipped table does not have; letting it paint washes
        // the whole viewport. The header's soft dissolve is drawn by the
        // chrome bar instead.
        table.topEdgeEffect.isHidden = true
        table.bottomEdgeEffect.isHidden = true
        if onContentTap != nil {
            let tap = UITapGestureRecognizer(
                target: context.coordinator,
                action: #selector(TranscriptListCoordinator<Item, Row, Accessory>.contentTapped)
            )
            tap.cancelsTouchesInView = false
            table.addGestureRecognizer(tap)
        }
        if onLongPress != nil {
            context.coordinator.installRowPress(on: table)
        }
        context.coordinator.install(view: self, table: table)
        context.coordinator.joinPoseCarry(context.environment.poseCarry, scope: context.environment.poseScope)
        if animatesEntrance, !UIAccessibility.isReduceMotionEnabled {
            let flip = table.transform
            table.alpha = 0
            table.transform = flip.concatenating(CGAffineTransform(translationX: 0, y: 12))
            UIView.animate(
                withDuration: 0.5,
                delay: OpeningEntranceSection.timeline.delay,
                usingSpringWithDamping: 0.86,
                initialSpringVelocity: 0
            ) {
                table.alpha = 1
                table.transform = flip
            }
        }
        return table
    }

    func updateUIView(_ table: UITableView, context: Context) {
        context.coordinator.update(view: self, table: table)
    }

    static func dismantleUIView(_ table: UITableView, coordinator: TranscriptListCoordinator<Item, Row, Accessory>) {
        coordinator.leavePoseCarry()
    }

    func makeCoordinator() -> TranscriptListCoordinator<Item, Row, Accessory> {
        TranscriptListCoordinator()
    }
}

@MainActor
final class TranscriptListCoordinator<Item: Identifiable & Equatable, Row: View, Accessory: View>:
    NSObject, UITableViewDataSource, UITableViewDelegate
where Item.ID == String {
    /// Internal, not private: `TranscriptListView+NearNewest` publishes through
    /// it.
    var view: TranscriptListView<Item, Row, Accessory>?
    var items: [Item] = []
    var showsAccessory = false
    /// The insets the screen asked for, the send landing's room included;
    /// `TranscriptListView+Insets`.
    var appliedInsets: UIEdgeInsets?
    /// The reader's own send held at the top, and the room held open under
    /// it; `TranscriptListView+SendLanding`.
    var landedItemID: String?
    var landingInsetTop: CGFloat?
    var appliedRowRevision = 0
    /// Rows re-hosted by updates since mount; the substrate's cost, counted
    /// so tests can pin that an inset change re-hosts nothing.
    var reconfiguredRowCount = 0
    /// The newest item, when it arrived while the reader was at the tail and
    /// its top is being held in view rather than its end. Driven from
    /// `TranscriptListView+NearNewest`.
    var followedTopItemID: String?
    /// Installed by `TranscriptListView+RowPress`.
    var rowPress: TranscriptRowPress?
    /// The last update's anchor, re-applied as late row heights land; see
    /// `TranscriptListView+AnchorHold`.
    var heldAnchor: (anchor: TranscriptScrollAnchor, offset: CGFloat)?
    var isReapplyingAnchor = false
    var contentSizeObservation: NSKeyValueObservation?
    /// A viewport that changes height moves where short content rests.
    var boundsObservation: NSKeyValueObservation?
    var handledRevealToken: UUID?
    /// Where this transcript rests across a pose change; `TranscriptListView+Pose`.
    var pose: TranscriptPose?
    /// The near-newest answer the view currently holds. It is cached here and
    /// not read back from the binding: the binding write is asynchronous, so a
    /// second reading inside the same turn would compare against a value the
    /// first write has not delivered yet and swallow its own correction.
    /// Driven from `TranscriptListView+NearNewest`.
    var nearNewest = TranscriptNearNewest()
    var nearNewestSyncScheduled = false
    /// The settle in flight and its frame clock; `TranscriptListView+SettleTravel`.
    var settleTravel: TranscriptSettleTravel?
    var settleLink: TranscriptSettleLink?
    weak var table: UITableView?
    /// The visible set last handed upward, so a scroll that changes nothing
    /// about which rows are on screen — an inset write, a re-host — does not
    /// wake the read path every runloop turn.
    var publishedVisibleItemIDs: [String]?

    // MARK: Lifecycle from the representable

    func install(view: TranscriptListView<Item, Row, Accessory>, table: UITableView) {
        self.view = view
        self.table = table
        items = view.items
        showsAccessory = view.showsAccessory
        appliedRowRevision = view.rowRevision
        applyInsets(view: view, table: table, wasNearNewest: true)
        table.reloadData()
        observeContentSize(of: table)
        scheduleNearNewestSync(table)
    }

    // MARK: UITableViewDataSource

    func tableView(_ tableView: UITableView, numberOfRowsInSection section: Int) -> Int {
        items.count + (showsAccessory ? 1 : 0)
    }

    func tableView(_ tableView: UITableView, cellForRowAt indexPath: IndexPath) -> UITableViewCell {
        let cell = tableView.dequeueReusableCell(withIdentifier: "row", for: indexPath)
        cell.selectionStyle = .none
        cell.backgroundColor = .clear
        configure(cell: cell, at: indexPath)
        return cell
    }

    private func configure(cell: UITableViewCell, at indexPath: IndexPath) {
        guard let view else { return }
        if indexPath.row >= items.count {
            cell.contentConfiguration = UIHostingConfiguration {
                view.accessory()
            }
            .margins(.vertical, 0)
            .margins(.horizontal, TranscriptMargins.side)
            .minSize(width: 0, height: 0)
        } else {
            let item = items[items.count - 1 - indexPath.row]
            cell.contentConfiguration = UIHostingConfiguration {
                view.row(item)
            }
            .margins(.vertical, 0)
            .margins(.horizontal, TranscriptMargins.side)
            .minSize(width: 0, height: 0)
        }
        // The counter-flip lives on the UIKit contentView, not inside the
        // hosted SwiftUI, so the hosting view's own layer renders upright. It
        // is applied *after* the configuration, because assigning one that the
        // cell cannot reuse — a brand-new cell, or a swap between the row and
        // accessory configurations — replaces `contentView` with a fresh one,
        // and a flip set beforehand would ride away on the discarded view,
        // leaving that row mirrored inside the flipped table.
        cell.contentView.transform = CGAffineTransform(scaleX: 1, y: -1)
        cell.stackForReactionStamps(order: items.count - 1 - indexPath.row)
    }

    // MARK: UITableViewDelegate

    @objc func contentTapped() {
        view?.onContentTap?()
    }

    func scrollViewDidScroll(_ scrollView: UIScrollView) {
        scheduleNearNewestSync(scrollView)
    }

    func scrollViewWillBeginDragging(_ scrollView: UIScrollView) {
        // A touch owns the viewport from here; nothing is travelling to rest,
        // and nothing the finger rested on is being held any more.
        endSettling()
        followedTopItemID = nil
        heldAnchor = nil
        pose?.pendingResume = nil
        rowPress?.cancelHold()
    }

    func scrollViewDidEndScrollingAnimation(_ scrollView: UIScrollView) {
        // A reveal's `scrollToRow` travel is over; settles close themselves.
        scheduleNearNewestSync(scrollView)
        if let table = scrollView as? UITableView { noteRestingAnchor(table) }
    }

    func scrollViewDidEndDecelerating(_ scrollView: UIScrollView) {
        scheduleNearNewestSync(scrollView)
        if let table = scrollView as? UITableView { noteRestingAnchor(table) }
    }

    func scrollViewDidEndDragging(_ scrollView: UIScrollView, willDecelerate decelerate: Bool) {
        if !decelerate, let table = scrollView as? UITableView { noteRestingAnchor(table) }
    }
}

#endif
