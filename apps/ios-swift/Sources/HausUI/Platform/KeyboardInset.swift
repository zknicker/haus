import SwiftUI
#if canImport(UIKit)
import UIKit
#endif

/// One reading of how far the keyboard reaches up from the bottom of the screen, and whether the
/// change that produced it is one of UIKit's own keyboard animations or a finger dragging the
/// keyboard through an interactive dismissal.
struct KeyboardInsetSample: Equatable {
    /// Distance from the screen's bottom edge to the keyboard's top edge — the home-indicator
    /// inset when no keyboard is up, never less.
    let inset: CGFloat
    /// True when UIKit is animating the keyboard to this frame (rise, fall, or a released drag
    /// settling); false while a finger tracks it.
    let isAnimated: Bool

    /// The inset a keyboard whose top edge sits at `keyboardTop` implies, both measured in the same
    /// space as `screenBottom`. A keyboard below the screen — hidden — reads as the safe area, and
    /// so does any keyboard frame while nothing is editing: after a cancelled back swipe out of a
    static func inset(
        screenBottom: CGFloat,
        keyboardTop: CGFloat,
        bottomSafeArea: CGFloat,
        isEditing: Bool
    ) -> CGFloat {
        guard isEditing else { return bottomSafeArea }
        return max(bottomSafeArea, (screenBottom - keyboardTop).rounded(.toNearestOrAwayFromZero))
    }

    /// The part of the window's bottom safe area a view reaches into. A
    /// screen that ends at the fold above another pane reaches none of it,
    /// and a keyboard below that edge reaches nothing either.
    static func bottomSafeArea(windowInset: CGFloat, windowBottom: CGFloat, viewBottom: CGFloat) -> CGFloat {
        max(windowInset - (windowBottom - viewBottom), 0)
    }

    /// A change is UIKit's own animation if it lands inside an animation block, or inside the window
    /// a keyboard notification announced. Interactive dismissal posts no notification while the
    /// finger moves, so every frame it drives reads as tracking.
    static func isAnimated(
        inheritedAnimationDuration: TimeInterval,
        now: TimeInterval,
        announcedAnimationEnd: TimeInterval
    ) -> Bool {
        inheritedAnimationDuration > 0 || now < announcedAnimationEnd
    }

    /// What the layout following the keyboard runs: the keyboard's own curve for an animated
    /// change, nothing at all while a finger drags it — a spring there trails the finger.
    var animation: Animation? { isAnimated ? ComposerKeyboardMotion.travel : nil }
}

#if canImport(UIKit)

extension View {
    /// Reports the keyboard's reach from the screen bottom, frame by frame through an interactive
    /// dismissal. Attach to a view that spans the screen; the reader ignores safe areas itself.
    func onKeyboardInsetChange(_ action: @escaping (KeyboardInsetSample) -> Void) -> some View {
        background {
            KeyboardInsetReader(onChange: action)
                .ignoresSafeArea()
                .allowsHitTesting(false)
                .accessibilityHidden(true)
        }
    }
}

/// Reads the keyboard from UIKit's keyboard layout guide rather than from SwiftUI's keyboard safe
/// area. The guide is what follows a finger through an interactive dismissal, it is correct
/// whenever the view is in a window — a safe area read through a `GeometryReader` went stale
/// across a navigation pop and left the composer under a returning keyboard — and it is
/// independent of the shell's layout, so the sidebar never resizes for a keyboard.
private struct KeyboardInsetReader: UIViewRepresentable {
    let onChange: (KeyboardInsetSample) -> Void

    func makeUIView(context: Context) -> KeyboardInsetView {
        let view = KeyboardInsetView()
        view.onChange = onChange
        return view
    }

    func updateUIView(_ view: KeyboardInsetView, context: Context) {
        view.onChange = onChange
    }
}

private final class KeyboardInsetView: UIView {
    var onChange: ((KeyboardInsetSample) -> Void)?
    private let probe = UIView()
    private var reportedInset: CGFloat?
    private var announcedAnimationEnd: TimeInterval = 0

    override init(frame: CGRect) {
        super.init(frame: frame)
        isUserInteractionEnabled = false
        backgroundColor = .clear
        probe.translatesAutoresizingMaskIntoConstraints = false
        probe.isUserInteractionEnabled = false
        addSubview(probe)
        // The probe's top is pinned to the guide, so every guide move — animated or tracked —
        // invalidates this view's layout and lands in `layoutSubviews`.
        NSLayoutConstraint.activate([
            probe.leadingAnchor.constraint(equalTo: leadingAnchor),
            probe.widthAnchor.constraint(equalToConstant: 1),
            probe.topAnchor.constraint(equalTo: keyboardLayoutGuide.topAnchor),
            probe.bottomAnchor.constraint(equalTo: bottomAnchor),
        ])
        // Selector-based, so the registration ends with the view.
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(keyboardWillChangeFrame(_:)),
            name: UIResponder.keyboardWillChangeFrameNotification,
            object: nil
        )
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    /// The announced frame is reported straight away, on the keyboard's own curve. The guide alone
    /// back swipe with its keyboard up — and its last mid-flight reading would hold the composer in
    /// the air. An announcement made while this screen is off the window is picked up from the
    /// guide when it returns (`didMoveToWindow`).
    @objc private func keyboardWillChangeFrame(_ note: Notification) {
        let duration = (note.userInfo?[UIResponder.keyboardAnimationDurationUserInfoKey] as? Double) ?? 0
        announcedAnimationEnd = CACurrentMediaTime() + duration + 0.05
        guard let window,
              let end = note.userInfo?[UIResponder.keyboardFrameEndUserInfoKey] as? CGRect
        else { return }
        let bottom = convert(bounds, to: window).maxY
        let inset = KeyboardInsetSample.inset(
            screenBottom: bottom,
            keyboardTop: window.convert(end, from: nil).minY,
            bottomSafeArea: KeyboardInsetSample.bottomSafeArea(of: window, below: bottom),
            isEditing: KeyboardResponderProbe.current() != nil
        )
        report(inset, isAnimated: true)
    }

    override func didMoveToWindow() {
        super.didMoveToWindow()
        if window != nil { setNeedsLayout() }
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        guard let window else { return }
        let inset = KeyboardInsetSample.inset(
            screenBottom: bounds.maxY,
            keyboardTop: keyboardLayoutGuide.layoutFrame.minY,
            bottomSafeArea: KeyboardInsetSample.bottomSafeArea(of: window, below: convert(bounds, to: window).maxY),
            isEditing: KeyboardResponderProbe.current() != nil
        )
        report(
            inset,
            isAnimated: KeyboardInsetSample.isAnimated(
                inheritedAnimationDuration: UIView.inheritedAnimationDuration,
                now: CACurrentMediaTime(),
                announcedAnimationEnd: announcedAnimationEnd
            )
        )
    }

    private func report(_ inset: CGFloat, isAnimated: Bool) {
        guard inset != reportedInset else { return }
        // The first reading is where the screen starts, not a move to animate.
        let sample = KeyboardInsetSample(inset: inset, isAnimated: reportedInset != nil && isAnimated)
        reportedInset = inset
        onChange?(sample)
    }
}

extension KeyboardInsetSample {
    @MainActor
    static func bottomSafeArea(of window: UIWindow, below viewBottom: CGFloat) -> CGFloat {
        bottomSafeArea(windowInset: window.safeAreaInsets.bottom, windowBottom: window.bounds.maxY, viewBottom: viewBottom)
    }
}

/// Whether anything is editing — the one condition under which a keyboard frame belongs to a screen.
@MainActor
private enum KeyboardResponderProbe {
    private static weak var found: UIResponder?

    static func current() -> UIResponder? {
        found = nil
        UIApplication.shared.sendAction(#selector(UIResponder.hausReportFirstResponder), to: nil, from: nil, for: nil)
        return found
    }

    static func record(_ responder: UIResponder) { found = responder }
}

extension UIResponder {
    @objc fileprivate func hausReportFirstResponder() { KeyboardResponderProbe.record(self) }
}

#else

extension View {
    func onKeyboardInsetChange(_ action: @escaping (KeyboardInsetSample) -> Void) -> some View { self }
}

#endif
