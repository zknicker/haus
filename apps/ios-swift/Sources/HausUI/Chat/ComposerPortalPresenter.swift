import SwiftUI

/// The screen currently entitled to draw an attachment portal.
///
/// appears before the Chat behind it disappears, so the identity is what decides: a screen leaving
/// only clears the presenter if the registration still belongs to it.
struct ComposerPortalHost: Identifiable {
    let id: UUID
    let interaction: ComposerInteraction
    let transitionNamespace: Namespace.ID
    /// Carried across the window boundary because the app's appearance preference is applied to the
    /// app window and cannot reach a window that is not in that view tree.
    let colorScheme: ColorScheme
}

@MainActor
@Observable
final class ComposerPortalPresenter {
    static let shared = ComposerPortalPresenter()

    private(set) var host: ComposerPortalHost?

    init() {}

    func present(_ host: ComposerPortalHost) {
        self.host = host
    }

    func resign(_ id: UUID) {
        guard host?.id == id else { return }
        host = nil
    }
}

/// What the portal's overlay window does with a touch, given what the portal is doing.
enum ComposerPortalWindowRule {
    /// The window is a pane of glass except while a portal is genuinely open.
    ///
    /// An open portal owns every touch on the screen — that is what the scrim is for, and it now
    /// covers the keyboard too, exactly as the reference does. A card that is only *leaving* — a
    /// removal transition, or a media card collapsing into its landing tile — must hand every touch
    /// straight back to the composer underneath, which is what it did when the portal drew inline.
    ///
    /// The window is never hidden while a screen hosts a portal: hiding it the instant the overlay
    /// clears would cut the card's removal transition and the whole collapse off mid-frame.
    static func ownsTheScreen(overlay: ComposerOverlay?) -> Bool { overlay != nil }
}

extension View {
    /// Hosts this screen's composer attachment portal.
    ///
    /// On iOS the portal is drawn in an overlay window above the keyboard rather than inline, so
    /// this only registers the screen's state; see `ComposerPortalWindowController`.
    func composerAttachmentPortal(
        interaction: ComposerInteraction,
        transitionNamespace: Namespace.ID
    ) -> some View {
        modifier(
            ComposerAttachmentPortalHostModifier(
                interaction: interaction,
                transitionNamespace: transitionNamespace
            )
        )
    }
}

private struct ComposerAttachmentPortalHostModifier: ViewModifier {
    let interaction: ComposerInteraction
    let transitionNamespace: Namespace.ID

    @Environment(\.colorScheme) private var colorScheme
    @State private var id = UUID()

    func body(content: Content) -> some View {
        #if os(iOS)
        content
            .background {
                ComposerPortalSceneReader { scene in
                    ComposerPortalWindowController.shared.attach(to: scene)
                }
                .allowsHitTesting(false)
                .accessibilityHidden(true)
            }
            .onAppear {
                ComposerPortalWindowController.shared.ensureWindow()
                present()
            }
            .onChange(of: colorScheme) { _, _ in present() }
            .onDisappear {
                ComposerPortalPresenter.shared.resign(id)
                ComposerPortalWindowController.shared.detachIfIdle()
            }
        #else
        // macOS builds the package for unit tests only and has no keyboard window to clear, so the
        // portal keeps drawing inline the way it always did.
        content.overlay(alignment: .bottomLeading) {
            GeometryReader { proxy in
                ComposerAttachmentPortal(
                    interaction: interaction,
                    availableSize: proxy.size,
                    transitionNamespace: transitionNamespace
                )
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomLeading)
            }
        }
        #endif
    }

    private func present() {
        ComposerPortalPresenter.shared.present(
            ComposerPortalHost(
                id: id,
                interaction: interaction,
                transitionNamespace: transitionNamespace,
                colorScheme: colorScheme
            )
        )
    }
}
