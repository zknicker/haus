#if os(iOS)
import SwiftUI
import UIKit

/// The sidebar drawer as UIKit draws it: the sidebar and the canvas each in a
/// hosting controller, moved by layer properties alone.
///
/// A pan frame sets a translation, a corner radius, two alphas, and a clip
/// width. None of that is SwiftUI state or a layout of either hosted tree, so
/// dragging the canvas costs the render server a recomposite and nothing more.
/// The settle is a `UIViewPropertyAnimator` spring seeded with the release
/// velocity, and a finger that lands mid-settle catches the canvas where it is.
/// `HausDrawerState` hears only the discrete moments SwiftUI readers need.
@MainActor
final class HausDrawerController: UIViewController, HausDrawerMotion {
    private let drawer: HausDrawerState
    private let sidebar: UIViewController
    private let canvas: UIViewController
    /// Clips the sidebar to the canvas's leading edge.
    private let sidebarClip = UIView()
    /// The canvas's shadow, drawn from a path on a view of its own so the
    /// canvas's content never has to be rendered offscreen to find its outline.
    private let shadowView = UIView()
    /// Translates and rounds the canvas.
    private let canvasClip = UIView()
    private let veil = UIView()
    private let panDelegate = DrawerPanDelegate()
    private let feedback = UISelectionFeedbackGenerator()
    private var animator: UIViewPropertyAnimator?
    /// The canvas's leading edge, as last applied.
    private var offset: CGFloat = 0
    /// Where the canvas was when the current drag caught it.
    private var dragStart: CGFloat = 0
    private var laidOutSize: CGSize = .zero

    init(drawer: HausDrawerState, sidebar: UIViewController, canvas: UIViewController) {
        self.drawer = drawer
        self.sidebar = sidebar
        self.canvas = canvas
        super.init(nibName: nil, bundle: nil)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .clear

        sidebarClip.clipsToBounds = true
        embed(sidebar, in: sidebarClip)
        view.addSubview(sidebarClip)

        shadowView.isUserInteractionEnabled = false
        shadowView.layer.shadowColor = UIColor.black.cgColor
        shadowView.layer.shadowOpacity = 0.13
        shadowView.layer.shadowRadius = 10
        shadowView.layer.shadowOffset = CGSize(width: -6, height: 0)
        view.addSubview(shadowView)

        canvasClip.clipsToBounds = true
        canvasClip.layer.cornerCurve = .continuous
        embed(canvas, in: canvasClip)
        veil.addGestureRecognizer(UITapGestureRecognizer(target: self, action: #selector(veilTapped)))
        canvasClip.addSubview(veil)
        view.addSubview(canvasClip)

        let pan = UIPanGestureRecognizer(target: self, action: #selector(handlePan(_:)))
        panDelegate.isOpen = { [weak self] in self?.drawer.isPresented ?? false }
        pan.delegate = panDelegate
        canvasClip.addGestureRecognizer(pan)

        drawer.motion = self
        paintVeil()
        updateInteraction()
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (self: Self, _) in
            self.paintVeil()
            self.apply(offset: self.offset)
        }
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        let bounds = view.bounds
        // Only a new container size lays anything out. Hosted content asking
        // for layout must not reset frames under a running settle.
        guard bounds.size != laidOutSize else { return }
        laidOutSize = bounds.size
        interruptSettle()
        place(canvasClip, in: bounds)
        place(shadowView, in: bounds)
        shadowView.layer.shadowPath = UIBezierPath(
            roundedRect: CGRect(origin: .zero, size: bounds.size),
            cornerRadius: DrawerGeometry.maxCornerRadius
        ).cgPath
        canvas.view.frame = canvasClip.bounds
        veil.frame = canvasClip.bounds
        place(sidebar.view, in: CGRect(x: 0, y: 0, width: width, height: bounds.height))
        apply(offset: drawer.isPresented ? width : 0)
    }

    // MARK: HausDrawerMotion

    func settle(open: Bool) {
        settle(open: open, velocity: 0)
    }

    // MARK: Gestures

    @objc private func handlePan(_ pan: UIPanGestureRecognizer) {
        let translation = pan.translation(in: view).x
        switch pan.state {
        case .began:
            dragStart = interruptSettle()
            drawer.beginDrag()
            track(translation)
        case .changed:
            track(translation)
        case .ended:
            release(translation, velocity: pan.velocity(in: view).x)
        case .cancelled, .failed:
            release(translation, velocity: 0)
        default:
            break
        }
    }

    @objc private func veilTapped() {
        drawer.set(open: false)
    }

    private func track(_ translation: CGFloat) {
        let next = DrawerInteraction.offset(start: dragStart, translation: translation, width: width)
        drawer.setSidebarHidden(next <= 0)
        apply(offset: next)
    }

    private func release(_ translation: CGFloat, velocity: CGFloat) {
        let current = DrawerInteraction.offset(start: dragStart, translation: translation, width: width)
        let opens = DrawerInteraction.settlesOpen(offset: current, velocity: velocity, width: width)
        settle(open: opens, velocity: velocity)
    }

    // MARK: Motion

    private var width: CGFloat { DrawerInteraction.width(containerWidth: view.bounds.width) }

    private func settle(open: Bool, velocity: CGFloat) {
        let start = interruptSettle()
        let target = open ? width : 0
        // The snap is the moment the drawer commits, by finger or by tap.
        if drawer.commit(open: open) { feedback.selectionChanged() }
        updateInteraction()
        // A Chat selection swaps the screen under the veil in this same frame;
        // the veil leaves at once rather than dissolving over a Chat that was
        // never behind it.
        if drawer.close == .chatSelection {
            veil.alpha = 0
            // Render the incoming screen now, so the first animation frame
            // already carries it instead of an empty canvas.
            canvas.view.layoutIfNeeded()
        }
        if target > 0 { drawer.setSidebarHidden(false) }
        guard view.window != nil, abs(target - start) > 0.5 else {
            apply(offset: target)
            drawer.setSidebarHidden(target <= 0)
            return
        }
        let reduceMotion = UIAccessibility.isReduceMotionEnabled
        let timing: UITimingCurveProvider = reduceMotion
            ? UICubicTimingParameters(animationCurve: .easeOut)
            : Self.spring(velocity: velocity, start: start, target: target)
        let animator = UIViewPropertyAnimator(duration: reduceMotion ? 0.25 : 0.38, timingParameters: timing)
        animator.addAnimations { [weak self] in self?.apply(offset: target) }
        animator.addCompletion { [weak self, weak animator] position in
            guard let self, self.animator === animator, position == .end else { return }
            self.animator = nil
            self.drawer.setSidebarHidden(target <= 0)
        }
        self.animator = animator
        animator.startAnimation()
    }

    /// Stops a running settle where it is on screen and returns that offset.
    @discardableResult
    private func interruptSettle() -> CGFloat {
        guard let animator else { return offset }
        let current = canvasClip.layer.presentation()?.affineTransform().tx ?? offset
        self.animator = nil
        animator.stopAnimation(true)
        apply(offset: current)
        return current
    }

    /// The whole per-frame write: layer properties only.
    private func apply(offset: CGFloat) {
        self.offset = offset
        let geometry = DrawerGeometry(offset: offset, width: width)
        let shift = CGAffineTransform(translationX: offset, y: 0)
        canvasClip.transform = shift
        shadowView.transform = shift
        canvasClip.layer.cornerRadius = geometry.cornerRadius
        shadowView.alpha = geometry.progress
        sidebarClip.frame = CGRect(x: 0, y: 0, width: geometry.sidebarReveal, height: view.bounds.height)
        sidebar.view.transform = CGAffineTransform(translationX: geometry.sidebarShift, y: 0)
        veil.alpha = HausDrawerVeil.isPainted(progress: geometry.progress, close: drawer.close)
            ? HausDrawerVeil.opacity(for: colorScheme, progress: geometry.progress)
            : 0
    }

    private func updateInteraction() {
        let isOpen = drawer.isPresented
        sidebar.view.isUserInteractionEnabled = isOpen
        sidebarClip.accessibilityElementsHidden = !isOpen
        veil.isUserInteractionEnabled = isOpen
    }

    private func paintVeil() {
        veil.backgroundColor = UIColor(HausDrawerVeil.color(for: colorScheme))
    }

    private var colorScheme: ColorScheme {
        traitCollection.userInterfaceStyle == .dark ? .dark : .light
    }

    private func embed(_ child: UIViewController, in container: UIView) {
        addChild(child)
        child.view.backgroundColor = .clear
        container.addSubview(child.view)
        child.didMove(toParent: self)
    }

    /// Frames a view that carries a transform: through bounds and center,
    /// which a transform leaves alone.
    private func place(_ view: UIView, in frame: CGRect) {
        view.bounds = CGRect(origin: .zero, size: frame.size)
        view.center = CGPoint(x: frame.midX, y: frame.midY)
    }

    /// The settle spring, seeded with the release velocity. Reduce Motion
    /// trades it for a short ease-out with no overshoot.
    private static func spring(velocity: CGFloat, start: CGFloat, target: CGFloat) -> UISpringTimingParameters {
        let relative = DrawerInteraction.settleVelocity(velocity: velocity, offset: start, target: target)
        return UISpringTimingParameters(duration: 0.38, bounce: 0.06, initialVelocity: CGVector(dx: relative, dy: 0))
    }
}
#endif
