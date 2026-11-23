import SwiftUI

/// The portal's one card. The source menu and the media pickers share it, so moving between them
/// changes the card's frame, corner radius, and contents instead of swapping two surfaces.
struct ComposerPortalCard: View {
    let overlay: ComposerOverlay?
    let cornerRadius: CGFloat
    let remainingCapacity: Int
    @AccessibilityFocusState.Binding var focusedSource: ComposerSource?
    let onShow: (ComposerOverlay) -> Void
    let onFiles: () -> Void
    let onAddPhotos: ([URL], CGRect?) -> Void
    let onCapture: @MainActor @Sendable (Data) -> Void
    let onEscape: () -> Void

    /// Whether the card is the floating glass menu (true) or an opaque media surface.
    private var isSourceMenu: Bool { overlay == .sources }

    /// How the card's contents crossfade while the frame morphs between overlays.
    private static let contentAnimation: Animation = .smooth(duration: 0.22)

    var body: some View {
        // One card, one identity, one *surface*, every overlay. A branch on the overlay would
        // remove one card and insert another, degrading the morph to a crossfade — and so would
        // mounting or unmounting the glass at the menu-to-media flip: a leaving glass plate fades
        // on the system's own schedule, not the content transition's, so it lingered as a second
        // stretched outline over the arriving media card. The glass therefore stays mounted for
        // the card's whole life — an empty glass host while media shows — and only the menu rows
        // are ever its content. Everything media-related lives OUTSIDE the `GlassEffectContainer`
        // as an ordinary ZStack sibling: on device (not in Simulator, which renders glass flat)
        // the container composites its glass layer above plain views inside it, so a media
        // overlay inside the container rendered as a blank black card under the plate. The black
        // backdrop and media views crossfade above the container, clipped to the same morphing
        // shape, so there is still a single outline at every frame.
        ZStack {
            GlassEffectContainer(spacing: 12) {
                ZStack {
                    menuContent
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .animation(Self.contentAnimation, value: overlay)
                .clipShape(cardShape)
                // Interactive glass belongs at the one shape a finger actually touches:
                // glass cannot sample glass, so a second interactive layer inside the rows
                // only muddies them.
                .glassEffect(.regular.interactive(), in: cardShape)
            }
            ZStack {
                if !isSourceMenu {
                    // The media backdrop fades in over the plate, darkening the card into
                    // the media surface while the frame grows.
                    Color.black.transition(.opacity)
                }
                mediaContent
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .animation(Self.contentAnimation, value: overlay)
            .clipShape(cardShape)
        }
        .overlay {
            cardShape
                .stroke(.white.opacity(0.12), lineWidth: 0.5)
                .opacity(isSourceMenu ? 0 : 1)
                .allowsHitTesting(false)
        }
        .shadow(color: .black.opacity(isSourceMenu ? 0 : 0.28), radius: 24, y: 10)
        .accessibilityAction(.escape, onEscape)
        .accessibilityAddTraits(.isModal)
    }

    /// The card's one shape — clip, glass, and stroke all take it, so they cannot drift.
    ///
    /// Always a plain rounded rectangle, never a concentric shape: SwiftUI resolves `.concentric`
    /// against settled layout, not against each frame of an animation, so a concentric media card
    /// kept a square corner for the whole menu-to-media morph and only rounded once its frame
    /// arrived. The concentricity itself is preserved as a number — the caller's `cornerRadius`
    /// carries the resolved concentric value for media overlays — and one shape type means the
    /// morph interpolates the radius alongside the frame, so the corner travels with the card.
    private var cardShape: RoundedRectangle {
        RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
    }

    @ViewBuilder
    private var menuContent: some View {
        if overlay == .sources {
            ComposerSourceMenu(
                focusedSource: $focusedSource,
                onCamera: { onShow(.camera) },
                onPhotos: { onShow(.photos) },
                onFiles: onFiles
            )
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .transition(contentTransition)
        }
    }

    @ViewBuilder
    private var mediaContent: some View {
        ZStack {
            if overlay == .photos {
                #if os(iOS)
                ComposerPhotoPickerView(
                    maximumSelectionCount: remainingCapacity,
                    onCancel: { onShow(.sources) },
                    onAdd: onAddPhotos
                )
                .transition(contentTransition)
                #endif
            }
            if overlay == .camera {
                #if os(iOS)
                CameraCaptureView(onCancel: { onShow(.sources) }, onCapture: onCapture)
                    .transition(contentTransition)
                #else
                ContentUnavailableView("Camera unavailable", systemImage: "camera")
                #endif
            }
        }
    }

    private var contentTransition: AnyTransition {
        .modifier(
            active: PortalContentTransitionModifier(opacity: 0, blur: 2),
            identity: PortalContentTransitionModifier(opacity: 1, blur: 0)
        )
    }
}

private struct PortalContentTransitionModifier: ViewModifier {
    let opacity: Double
    let blur: CGFloat

    func body(content: Content) -> some View {
        content.opacity(opacity).blur(radius: blur)
    }
}
