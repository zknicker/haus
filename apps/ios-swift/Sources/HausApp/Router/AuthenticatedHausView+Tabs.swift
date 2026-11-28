import HausAppModel
import HausModels
import HausUI
import SwiftUI

/// The root: five tabs, each with its own `NavigationStack` bound to the
/// router, and the router's one sheet. With stock chrome the system draws the
/// tab bar, in the trailing rail wherever bars are vertical. With custom
/// chrome the system tab bar stays hidden; the Capy-sized bottom chrome floats
/// over the tabs instead, and each tab's content clears it through the bottom
/// safe area.
extension AuthenticatedHausView {
    var tabShell: some View {
        TabView(selection: $router.selectedTab) {
            Tab("Home", systemImage: "house", value: HausTab.home) {
                adaptiveStack(.home) { homeRoot }.toolbarVisibility(tabBarVisibility, for: .tabBar)
            }
            Tab("Projects", systemImage: "number", value: HausTab.projects) {
                adaptiveStack(.projects) { projectsRoot }.toolbarVisibility(tabBarVisibility, for: .tabBar)
            }
            Tab("Tasks", systemImage: "list.bullet", value: HausTab.tasks) {
                adaptiveStack(.tasks) { tasksRoot }.toolbarVisibility(tabBarVisibility, for: .tabBar)
            }
            Tab(value: HausTab.you) {
                adaptiveStack(.you, root: { youRoot }, stacked: { youStack })
                    .toolbarVisibility(tabBarVisibility, for: .tabBar)
            } label: {
                Label { Text("You") } icon: { youTabIcon ?? Image(systemName: "person.crop.circle") }
            }
            Tab("Search", systemImage: "magnifyingglass", value: HausTab.search, role: .search) {
                adaptiveStack(.search) { searchRoot }.toolbarVisibility(tabBarVisibility, for: .tabBar)
            }
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            if showsBottomChrome {
                Color.clear.frame(height: max(bottomChromeClearance - deviceBottomInset, 0))
            }
        }
        .overlay(alignment: .bottom) {
            ZStack(alignment: .bottom) {
                if showsBottomChrome {
                    HausBottomChrome(
                        selection: $router.selectedTab,
                        items: tabBarItems,
                        isCollapsed: router.isChromeCollapsed && router.showsAskAnything,
                        onExpand: { router.unfoldChrome() },
                        onAsk: router.showsAskAnything ? { router.present(.askAnything) } : nil
                    )
                    .padding(.bottom, Self.bottomChromeInset - deviceBottomInset)
                    .transition(.offset(y: 24).combined(with: .opacity))
                }
            }
            .animation(.smooth(duration: 0.3), value: showsBottomChrome)
            .ignoresSafeArea(.keyboard)
        }
        .background {
            GeometryReader { proxy in
                Color.clear.onChange(of: proxy.safeAreaInsets.bottom, initial: true) { deviceBottomInset = $1 }
            }
            .ignoresSafeArea(.keyboard)
        }
        .environment(\.shellChrome, shellChrome)
        .onShellChromeChange { shellChrome = $0 }
        .onRegularWidthChange { router.layout = $0 ? .split : .stack }
        .sheet(item: sheetBinding) { routerSheet($0) }
        .task(id: store.settingsData?.viewer.avatarURL) {
            youTabIcon = await TabAvatarImage.image(url: store.settingsData?.viewer.avatarURL)
        }
    }

    private static let bottomChromeInset: CGFloat = 22

    private var showsBottomChrome: Bool {
        shellChrome == .custom && router.showsTabBar
    }

    private var tabBarVisibility: Visibility {
        shellChrome.tabBar(showsTabBar: router.showsTabBar)
    }

    /// Height from the screen's bottom edge to the top of the chrome.
    private var bottomChromeClearance: CGFloat {
        let ask = router.showsAskAnything
            ? HausBottomChrome<HausTab>.accessoryHeight + HausBottomChrome<HausTab>.gap
            : 0
        return Self.bottomChromeInset + HausBottomChrome<HausTab>.barHeight + ask
    }

    private var tabBarItems: [HausTabBarItem<HausTab>] {
        [
            HausTabBarItem(.home, label: "Home", systemImage: "house"),
            HausTabBarItem(.projects, label: "Projects", systemImage: "number"),
            HausTabBarItem(.tasks, label: "Tasks", systemImage: "list.bullet"),
            HausTabBarItem(.you, label: "You", systemImage: "person.crop.circle", image: youTabIcon),
            HausTabBarItem(.search, label: "Search", systemImage: "magnifyingglass"),
        ]
    }

    func stack<Root: View>(_ tab: HausTab, @ViewBuilder root: () -> Root) -> some View {
        NavigationStack(path: pathBinding(tab)) {
            root()
                .foldsBottomChrome(tab, router: router)
                .navigationDestination(for: HausRoute.self) { routeDestination($0) }
        }
    }

    private func adaptiveStack<Root: View>(_ tab: HausTab, @ViewBuilder root: () -> Root) -> some View {
        adaptiveStack(tab, root: root, stacked: { stack(tab, root: root) })
    }

    /// Compact width keeps the tab's stack. Regular width shows its list
    /// beside the selection (specs/ios-app.md, iPhone Duo). The pane's stack
    /// holds settings screens as themselves, so the settings screen it starts
    /// from draws the ones it pushes.
    @ViewBuilder
    private func adaptiveStack<Root: View, Stacked: View>(
        _ tab: HausTab,
        @ViewBuilder root: () -> Root,
        @ViewBuilder stacked: () -> Stacked
    ) -> some View {
        switch router.panes(tab) {
        case .stack:
            stacked()
        case let .split(selection, _):
            AdaptiveSplitView {
                root().foldsBottomChrome(tab, router: router)
            } content: {
                NavigationStack(path: navigationPath({ splitStack(tab) }) { router.setSplitStack($0, for: tab) }) {
                    Group {
                        if let selection {
                            routeDestination(selection).environment(\.chatHeaderShowsBack, false)
                        } else {
                            Color.clear
                        }
                    }
                    .navigationDestination(for: HausRoute.self) { routeDestination($0) }
                }
                .id(selection)
            }
        }
    }

    /// `routes` as a `NavigationStack` holds them: settings screens as
    /// themselves, everything else as routes. Only back and interactive pop
    /// write it, so a write keeps a prefix.
    func navigationPath(
        _ routes: @escaping () -> [HausRoute],
        write: @escaping ([HausRoute]) -> Void
    ) -> Binding<NavigationPath> {
        Binding(
            get: {
                routes().reduce(into: NavigationPath()) { navigation, route in
                    if case .settings(let settings) = route { navigation.append(settings) } else { navigation.append(route) }
                }
            },
            set: { write(Array(routes().prefix($0.count))) }
        )
    }

    private func splitStack(_ tab: HausTab) -> [HausRoute] {
        guard case let .split(_, stack) = router.panes(tab) else { return [] }
        return stack
    }

    private func pathBinding(_ tab: HausTab) -> Binding<[HausRoute]> {
        Binding(get: { router.path(tab) }, set: { router.setPath($0, for: tab) })
    }

    private var sheetBinding: Binding<HausSheet?> {
        Binding(get: { router.sheet }, set: { if $0 == nil { router.dismissSheet() } })
    }
}

extension View {
    /// Folds the shell's bottom chrome as this tab root's list scrolls (the
    /// list opts in with `reportsChromeScroll()`). Pushed screens sit outside
    /// the root's environment and never fold it.
    func foldsBottomChrome(_ tab: HausTab, router: HausRouter) -> some View {
        environment(\.chromeScroll) { old, new in
            router.scrollRoot(tab, from: chromeDistance(old), to: chromeDistance(new))
        }
    }

}

private func chromeDistance(_ metrics: ChromeScrollMetrics) -> Double {
    BottomChromeScroll.distance(
        offset: metrics.offset,
        topInset: metrics.topInset,
        bottomInset: metrics.bottomInset,
        content: metrics.content,
        container: metrics.container
    )
}
