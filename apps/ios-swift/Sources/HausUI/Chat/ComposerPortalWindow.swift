#if os(iOS)
import SwiftUI
import UIKit

/// The window the composer's attachment portal is drawn in.
///
/// The keyboard is not part of the app's window: iOS puts it in `UIRemoteKeyboardWindow`, above
/// everything the app draws. A portal drawn inside the app window therefore *cannot* overlap it —
/// whatever the z-order inside the app, the keyboard is painted on top — so the source menu was cut
/// off wherever the two met. The reference (ChatGPT) has the card overlap the keyboard's top rows,
/// which only a window of our own above the keyboard's can do.
///
/// This window never becomes key. The text field's first responder status, and therefore the
/// keyboard itself, has to stay with the app window: `isHidden = false` shows a window without
/// making it key, and `canBecomeKey` refuses the promotion outright.
@MainActor
final class ComposerPortalWindowController {
    static let shared = ComposerPortalWindowController()

    private weak var scene: UIWindowScene?
    private var window: ComposerPortalWindow?

    private init() {}

    /// Takes the scene the app is drawn in, and builds the window in it.
    func attach(to scene: UIWindowScene) {
        if self.scene !== scene {
            detach()
            self.scene = scene
        }
        ensureWindow()
    }

    /// Rebuilds the window for a screen that registered a portal after another screen's teardown
    /// took it away. A screen leaving and the next one arriving interleave in either order, and only
    /// one of those orders leaves the scene report to do it.
    func ensureWindow() {
        guard window == nil, let scene else { return }
        let window = ComposerPortalWindow(windowScene: scene)
        window.backgroundColor = .clear
        window.isOpaque = false
        let host = UIHostingController(rootView: ComposerPortalWindowContent())
        host.view.backgroundColor = .clear
        // The window spans the display and its content is positioned against the display, so the
        // frames the composer reports in `.global` land 1:1 on it. A safe area would inset the
        // SwiftUI root and break that correspondence.
        host.safeAreaRegions = []
        window.rootViewController = host
        // Never `makeKeyAndVisible()`: showing the window is all that is wanted, and taking key
        // status would take the text field's first responder — and the keyboard — with it.
        window.isHidden = false
        self.window = window
    }

    /// Tears the window down once no screen is hosting a portal, so it exists only for as long as a
    func detachIfIdle() {
        guard ComposerPortalPresenter.shared.host == nil else { return }
        detach()
    }

    private func detach() {
        window?.isHidden = true
        window?.rootViewController = nil
        window = nil
    }
}

/// Reports the window scene the app is actually being drawn in.
///
/// `UIApplication.connectedScenes` is the usual shortcut and the wrong one: it picks a scene rather
/// than *the* scene, and `onAppear` is no guarantee a view has reached a window yet. `didMoveToWindow`
/// is the first moment the answer exists and is exact.
struct ComposerPortalSceneReader: UIViewRepresentable {
    let onResolve: (UIWindowScene) -> Void

    func makeUIView(context: Context) -> AttachmentReportingView {
        AttachmentReportingView(onResolve: onResolve)
    }

    func updateUIView(_ view: AttachmentReportingView, context: Context) {
        view.onResolve = onResolve
    }

    @MainActor
    final class AttachmentReportingView: UIView {
        var onResolve: (UIWindowScene) -> Void

        init(onResolve: @escaping (UIWindowScene) -> Void) {
            self.onResolve = onResolve
            super.init(frame: .zero)
            isUserInteractionEnabled = false
        }

        @available(*, unavailable)
        required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }

        override func didMoveToWindow() {
            super.didMoveToWindow()
            guard let scene = window?.windowScene else { return }
            onResolve(scene)
        }
    }
}

/// Passes every touch through to the app below unless a portal is actually open.
///
/// The usual `hitTest` trick — return `nil` when the hit view is the root — cannot be used here: a
/// SwiftUI hosting view handles its own gestures, so it *is* the hit view whether or not anything
/// interactive is on screen. The portal's own state is the honest answer instead.
private final class ComposerPortalWindow: UIWindow {
    /// Overridden on the *getter*, not assigned. Since iOS 11 UIKit clamps an assigned
    /// `windowLevel` back down to one notch below the keyboard's own window, so `= 10_000_001`,
    /// `= .greatestFiniteMagnitude`, and `= .alert + 1` all end up under the keyboard and look
    /// identical. A getter UIKit never had the chance to rewrite is the one reported way past it.
    override var windowLevel: UIWindow.Level {
        get { UIWindow.Level(rawValue: .greatestFiniteMagnitude - 1) }
        set {}
    }

    override var canBecomeKey: Bool { false }

    /// Restores across the window boundary what `.isModal` gives the card inside it: while a portal
    /// owns the screen, VoiceOver must not reach the Chat behind it.
    override var accessibilityViewIsModal: Bool {
        get { ownsTheScreen }
        set {}
    }

    override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
        guard ownsTheScreen else { return nil }
        return super.hitTest(point, with: event)
    }

    private var ownsTheScreen: Bool {
        ComposerPortalWindowRule.ownsTheScreen(
            overlay: ComposerPortalPresenter.shared.host?.interaction.overlay
        )
    }
}

/// The overlay window's one root: whichever screen currently owns a portal, drawn against the
/// display rather than against that screen's container.
private struct ComposerPortalWindowContent: View {
    private let presenter = ComposerPortalPresenter.shared

    var body: some View {
        GeometryReader { proxy in
            ZStack(alignment: .bottomLeading) {
                if let host = presenter.host {
                    ComposerAttachmentPortal(
                        interaction: host.interaction,
                        availableSize: proxy.size,
                        transitionNamespace: host.transitionNamespace
                    )
                    .environment(\.colorScheme, host.colorScheme)
                    .id(host.id)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomLeading)
        }
        .ignoresSafeArea()
    }
}
#endif
