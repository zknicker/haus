import SwiftUI

/// The sidebar's place in the drawer. Its content is built once by the shell
/// body; this frame is the only view a pan frame invalidates on this side.
struct HausDrawerSidebarFrame<Content: View>: View {
    let drawer: HausDrawerState
    let drawerWidth: CGFloat
    let height: CGFloat
    private let content: Content

    init(
        drawer: HausDrawerState,
        drawerWidth: CGFloat,
        height: CGFloat,
        @ViewBuilder content: () -> Content
    ) {
        self.drawer = drawer
        self.drawerWidth = drawerWidth
        self.height = height
        self.content = content()
    }

    var body: some View {
        let progress = drawer.progress(width: drawerWidth)
        content
            // Any sliver of the sidebar counts as visible, mid-drag included.
            .environment(\.hausSidebarHidden, progress <= 0)
            // `.mask()` below rasterizes this view into an offscreen buffer
            // sized to its own resolved height, which `.ignoresSafeArea()`
            // bleed cannot expand — so the room the search and gear button
            // shadows spill into has to come from a genuinely taller proposed
            // frame. `ChatSidebarView` reserves that height as inert space at
            // both of its own ends; lifting the masked result by one of them
            // puts its content back where it was.
            .frame(
                width: drawerWidth,
                height: height + ChatSidebarView.shadowBleedHeight * 2,
                alignment: .top
            )
            .offset(x: -(1 - progress) * drawerWidth * 0.22)
            .mask(alignment: .leading) {
                Rectangle().frame(width: drawer.offset(width: drawerWidth))
            }
            .offset(y: -ChatSidebarView.shadowBleedHeight)
            .frame(height: height, alignment: .top)
            .allowsHitTesting(drawer.isPresented)
    }
}

/// The canvas's drawer geometry: offset, corners, shadow, veil, and the pan.
/// The Chat screen inside is built by the shell body and passes through
/// unchanged, so a pan frame re-runs this body and not the screen's.
struct HausDrawerCanvasFrame<Content: View>: View {
    let drawer: HausDrawerState
    let drawerWidth: CGFloat
    let onPresentedChange: (Bool) -> Void
    private let content: Content

    @Environment(\.colorScheme) private var colorScheme

    init(
        drawer: HausDrawerState,
        drawerWidth: CGFloat,
        onPresentedChange: @escaping (Bool) -> Void,
        @ViewBuilder content: () -> Content
    ) {
        self.drawer = drawer
        self.drawerWidth = drawerWidth
        self.onPresentedChange = onPresentedChange
        self.content = content()
    }

    var body: some View {
        let progress = drawer.progress(width: drawerWidth)
        content
            .environment(\.hausDrawerEngaged, drawer.isEngaged)
            .overlay {
                // The veil leaves by being removed, never by animating to
                // clear: progress is discrete, so it reads zero as soon as the
                // drawer is told to close. Removing it inside the closing
                // spring is the fade an interactive close wants; removing it
                // outside any animation, which is how a Chat selection commits,
                // is the hard cut that keeps the slide the only transition.
                if HausDrawerVeil.isPainted(progress: progress, close: drawer.close) {
                    HausDrawerVeil.color(for: colorScheme)
                        .opacity(HausDrawerVeil.opacity(for: colorScheme, progress: progress))
                        .contentShape(.rect)
                        .allowsHitTesting(drawer.isPresented)
                        .onTapGesture { drawer.set(open: false) }
                }
            }
            // The veil is shaped and expanded with the canvas it covers, so it
            // carries the same corners and the same full height.
            .clipShape(.rect(cornerRadius: drawer.cornerRadius(width: drawerWidth)))
            .ignoresSafeArea()
            .shadow(color: .black.opacity(0.13 * progress), radius: 20, x: -6)
            .offset(x: drawer.offset(width: drawerWidth))
            .drawerPan(isOpen: drawer.isPresented) { pan in
                drawer.handle(pan, width: drawerWidth)
            }
            // The snap is the moment the drawer commits, by finger or by tap.
            .sensoryFeedback(.selection, trigger: drawer.isPresented)
            .onAppear { drawer.onPresentedChange = onPresentedChange }
    }
}
