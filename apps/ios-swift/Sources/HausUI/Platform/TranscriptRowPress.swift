#if canImport(UIKit)
import UIKit
import UIKit.UIGestureRecognizerSubclass

/// The transcript's two presses on a row: a short *hold* that reports which
/// row a resting finger is on, and the long press that opens the screen's
/// drawer.
///
/// The hold exists so the row can answer the finger before the drawer does.
/// It lives outside the generic coordinator because Objective-C selectors and
/// delegate methods cannot be declared in a generic class's extension.
@MainActor
final class TranscriptRowPress: NSObject, UIGestureRecognizerDelegate {
    /// The row under a resting finger, then nil when the finger lifts, drifts,
    /// or the transcript scrolls.
    var onHoldChange: ((IndexPath?) -> Void)?
    /// The long press itself, once, as it begins.
    var onPress: ((IndexPath) -> Void)?

    private let hold = TranscriptHoldGesture()
    private let press = UILongPressGestureRecognizer()

    func install(on table: UITableView) {
        hold.onHoldChange = { [weak self, weak table] point in
            self?.onHoldChange?(point.flatMap { table?.indexPathForRow(at: $0) })
        }
        hold.delegate = self
        table.addGestureRecognizer(hold)

        press.addTarget(self, action: #selector(pressChanged(_:)))
        press.minimumPressDuration = 0.4
        press.delegate = self
        table.addGestureRecognizer(press)
    }

    /// The table began dragging: whatever the finger rested on, it is
    /// scrolling now.
    func cancelHold() {
        hold.release()
    }

    /// The row stays where it is: its hold tint carries through the drawer,
    /// and the drawer dims everything else, so nothing lifts or moves.
    @objc private func pressChanged(_ recognizer: UILongPressGestureRecognizer) {
        guard recognizer.state == .began,
              let table = recognizer.view as? UITableView,
              let indexPath = table.indexPathForRow(at: recognizer.location(in: table))
        else { return }
        onPress?(indexPath)
    }

    // MARK: UIGestureRecognizerDelegate

    func gestureRecognizer(
        _ gestureRecognizer: UIGestureRecognizer,
        shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer
    ) -> Bool {
        gestureRecognizer === hold || other === hold
    }

    /// A body's text view holds presses of its own — the loupe, text drag —
    /// that would win the hold on its words. They wait for the row's press.
    func gestureRecognizer(
        _ gestureRecognizer: UIGestureRecognizer,
        shouldBeRequiredToFailBy other: UIGestureRecognizer
    ) -> Bool {
        guard gestureRecognizer === press,
              let table = gestureRecognizer.view,
              let view = other.view
        else { return false }
        return view is UITextView && view.isDescendant(of: table)
    }
}

/// Watches a single resting finger without ever recognizing. A recognizer that
/// stays `.possible` keeps receiving touches whatever it would otherwise have
/// to wait for — a body's text view makes presses over its words wait for its
/// tap recognizers to fail, which held an ordinary long press back until the
/// finger lifted. Never recognizing also means the hold cannot cancel, delay,
/// or win a touch from anything else: a tap ends before the beat elapses, and
/// a drag past the slop lets go.
@MainActor
private final class TranscriptHoldGesture: UIGestureRecognizer {
    /// The resting point in the table, then nil when the hold lets go.
    var onHoldChange: ((CGPoint?) -> Void)?

    private static let beat: Duration = .milliseconds(180)
    private static let slop: CGFloat = 10

    private var origin: CGPoint?
    private var isHolding = false
    private var timer: Task<Void, Never>?

    override init(target: Any?, action: Selector?) {
        super.init(target: target, action: action)
        cancelsTouchesInView = false
        delaysTouchesEnded = false
    }

    convenience init() {
        self.init(target: nil, action: nil)
    }

    /// Lets go of a hold in progress; the rest of this touch is ignored.
    func release() {
        timer?.cancel()
        timer = nil
        origin = nil
        if isHolding {
            isHolding = false
            onHoldChange?(nil)
        }
    }

    override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent) {
        guard origin == nil, event.allTouches?.count == 1, let point = touches.first?.location(in: view) else {
            return finish()
        }
        origin = point
        timer = Task { [weak self] in
            try? await Task.sleep(for: Self.beat)
            guard !Task.isCancelled, let self, let origin else { return }
            isHolding = true
            onHoldChange?(origin)
        }
    }

    override func touchesMoved(_ touches: Set<UITouch>, with event: UIEvent) {
        guard let origin, let point = touches.first?.location(in: view) else { return }
        if hypot(point.x - origin.x, point.y - origin.y) > Self.slop { finish() }
    }

    override func touchesEnded(_ touches: Set<UITouch>, with event: UIEvent) { finish() }

    override func touchesCancelled(_ touches: Set<UITouch>, with event: UIEvent) { finish() }

    override func reset() {
        release()
        super.reset()
    }

    private func finish() {
        release()
        state = .failed
    }
}

#endif
