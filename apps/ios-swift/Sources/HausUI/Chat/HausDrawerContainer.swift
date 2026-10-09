import SwiftUI

/// The sidebar and the canvas in the drawer that slides one over the other.
///
/// On iOS each side is its own hosting controller inside `HausDrawerController`,
/// which moves the canvas with layer properties: a drag never evaluates a
/// SwiftUI body or lays out either side. The shell body builds both sides and
/// passes them through unchanged.
struct HausDrawerContainer<Sidebar: View, Canvas: View>: View {
    let drawer: HausDrawerState
    let onPresentedChange: (Bool) -> Void
    private let sidebar: Sidebar
    private let canvas: Canvas

    init(
        drawer: HausDrawerState,
        onPresentedChange: @escaping (Bool) -> Void,
        @ViewBuilder sidebar: () -> Sidebar,
        @ViewBuilder canvas: () -> Canvas
    ) {
        self.drawer = drawer
        self.onPresentedChange = onPresentedChange
        self.sidebar = sidebar()
        self.canvas = canvas()
    }

    var body: some View {
        #if os(iOS)
        HausDrawerHost(drawer: drawer, onPresentedChange: onPresentedChange, sidebar: sidebar, canvas: canvas)
            .ignoresSafeArea()
        #else
        // Previews and macOS tests: no drag, the drawer is shut or open.
        GeometryReader { proxy in
            ZStack(alignment: .leading) {
                sidebar.frame(width: DrawerInteraction.width(containerWidth: proxy.size.width))
                canvas.offset(x: drawer.isPresented ? DrawerInteraction.width(containerWidth: proxy.size.width) : 0)
            }
        }
        #endif
    }
}

/// Environment the App sets above the shell that the hosted sides read.
///
/// A hosting controller starts a fresh environment, so these do not cross the
/// UIKit boundary on their own; the container reads them where it sits and
/// re-applies them inside. A value set above the shell and read inside the
/// sidebar or the canvas must be added here. `scenePhase` is here because a
/// nested hosting controller does not track the scene's phase itself.
struct HausDrawerEnvironment: ViewModifier {
    private let scenePhase: ScenePhase
    private let opensWithEntrance: Bool
    private let reactionStickers: ReactionStickerBoard?
    private let cloudAgentCancel: CloudAgentCancelAction?
    private let cloudAgentStackExpansion: ThreadCloudAgentStackExpansion?
    private let chatEngagementSource: ChatEngagementSource?
    private let stoppedAgentSource: StoppedAgentSource?

    init(_ values: EnvironmentValues) {
        scenePhase = values.scenePhase
        opensWithEntrance = values.opensWithEntrance
        reactionStickers = values.reactionStickers
        cloudAgentCancel = values.cloudAgentCancel
        cloudAgentStackExpansion = values.threadCloudAgentStackExpansion
        chatEngagementSource = values.chatEngagementSource
        stoppedAgentSource = values.stoppedAgentSource
    }

    func body(content: Content) -> some View {
        content
            .environment(\.scenePhase, scenePhase)
            .environment(\.opensWithEntrance, opensWithEntrance)
            .environment(\.reactionStickers, reactionStickers)
            .environment(\.cloudAgentCancel, cloudAgentCancel)
            .environment(\.threadCloudAgentStackExpansion, cloudAgentStackExpansion)
            .environment(\.chatEngagementSource, chatEngagementSource)
            .environment(\.stoppedAgentSource, stoppedAgentSource)
    }
}

#if os(iOS)
private struct HausDrawerHost<Sidebar: View, Canvas: View>: UIViewControllerRepresentable {
    let drawer: HausDrawerState
    let onPresentedChange: (Bool) -> Void
    let sidebar: Sidebar
    let canvas: Canvas

    final class Coordinator {
        var sidebarHost: UIHostingController<SidebarRoot>?
        var canvasHost: UIHostingController<CanvasRoot>?
    }

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIViewController(context: Context) -> HausDrawerController {
        let environment = HausDrawerEnvironment(context.environment)
        let sidebarHost = UIHostingController(rootView: sidebarRoot(environment))
        // The sidebar lays out in the screen's safe area, as it always has, and
        // never answers the keyboard.
        sidebarHost.safeAreaRegions = .container
        let canvasHost = UIHostingController(rootView: canvasRoot(environment))
        // The canvas spans the screen; its screens take the insets they need
        // as values and read the keyboard themselves.
        canvasHost.safeAreaRegions = []
        context.coordinator.sidebarHost = sidebarHost
        context.coordinator.canvasHost = canvasHost
        drawer.onPresentedChange = onPresentedChange
        return HausDrawerController(drawer: drawer, sidebar: sidebarHost, canvas: canvasHost)
    }

    func updateUIViewController(_ controller: HausDrawerController, context: Context) {
        let environment = HausDrawerEnvironment(context.environment)
        context.coordinator.sidebarHost?.rootView = sidebarRoot(environment)
        context.coordinator.canvasHost?.rootView = canvasRoot(environment)
        drawer.onPresentedChange = onPresentedChange
    }

    typealias SidebarRoot = ModifiedContent<HausDrawerSidebarRoot<Sidebar>, HausDrawerEnvironment>
    typealias CanvasRoot = ModifiedContent<HausDrawerCanvasRoot<Canvas>, HausDrawerEnvironment>

    private func sidebarRoot(_ environment: HausDrawerEnvironment) -> SidebarRoot {
        HausDrawerSidebarRoot(drawer: drawer, content: sidebar).modifier(environment)
    }

    private func canvasRoot(_ environment: HausDrawerEnvironment) -> CanvasRoot {
        HausDrawerCanvasRoot(drawer: drawer, content: canvas).modifier(environment)
    }
}
#endif

/// The sidebar side's root: the only view on this side that observes the
/// drawer, and it reads one boolean that flips at the ends of travel.
struct HausDrawerSidebarRoot<Content: View>: View {
    let drawer: HausDrawerState
    let content: Content

    var body: some View {
        content.environment(\.hausSidebarHidden, drawer.isSidebarHidden)
    }
}

/// The canvas side's root: it observes `isEngaged`, which flips when a drag
/// starts and when the drawer settles shut.
struct HausDrawerCanvasRoot<Content: View>: View {
    let drawer: HausDrawerState
    let content: Content

    var body: some View {
        content.environment(\.hausDrawerEngaged, drawer.isEngaged)
    }
}
