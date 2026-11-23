import HausAppModel
import HausModels
import HausUI
import SwiftUI

/// The root: five tabs, each with its own `NavigationStack` bound to the
/// router, and the router's one sheet. The system tab bar stays hidden; the
/// Capy-sized bottom chrome floats over the tabs instead, and each tab's
/// content clears it through the bottom safe area.
extension AuthenticatedHausView {
    var tabShell: some View {
        TabView(selection: $router.selectedTab) {
            Tab(value: HausTab.home) {
                adaptiveStack(.home) { homeRoot }.toolbar(.hidden, for: .tabBar)
            }
            Tab(value: HausTab.projects) {
                adaptiveStack(.projects) { projectsRoot }.toolbar(.hidden, for: .tabBar)
            }
            Tab(value: HausTab.tasks) {
                adaptiveStack(.tasks) { tasksRoot }.toolbar(.hidden, for: .tabBar)
            }
            Tab(value: HausTab.you) {
                youStack.toolbar(.hidden, for: .tabBar)
            }
            Tab(value: HausTab.search) {
                searchRoot.toolbar(.hidden, for: .tabBar)
            }
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            if router.showsTabBar {
                Color.clear.frame(height: max(bottomChromeClearance - deviceBottomInset, 0))
            }
        }
        .overlay(alignment: .bottom) {
            if router.showsTabBar {
                HausBottomChrome(
                    selection: $router.selectedTab,
                    items: tabBarItems,
                    onAsk: router.showsAskAnything ? { router.present(.askAnything) } : nil
                )
                .padding(.bottom, Self.bottomChromeInset - deviceBottomInset)
                .ignoresSafeArea(.keyboard)
            }
        }
        .background {
            GeometryReader { proxy in
                Color.clear.onChange(of: proxy.safeAreaInsets.bottom, initial: true) { deviceBottomInset = $1 }
            }
            .ignoresSafeArea(.keyboard)
        }
        .onRegularWidthChange { router.layout = $0 ? .split : .stack }
        .sheet(item: sheetBinding) { routerSheet($0) }
        .task(id: store.settingsData?.viewer.avatarURL) {
            youTabIcon = await TabAvatarImage.image(url: store.settingsData?.viewer.avatarURL)
        }
    }

    private static let bottomChromeInset: CGFloat = 22

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
            root().navigationDestination(for: HausRoute.self) { routeDestination($0) }
        }
    }

    /// Compact width keeps the tab's stack. Regular width shows its list
    /// beside the selection, with a Worker opened from its Task beside the
    /// Task (specs/ios-app.md, iPhone Duo).
    @ViewBuilder
    private func adaptiveStack<Root: View>(_ tab: HausTab, @ViewBuilder root: () -> Root) -> some View {
        switch router.panes(tab) {
        case .stack:
            stack(tab, root: root)
        case let .split(selection, _, side):
            AdaptiveSplitView(showsSide: side != nil) {
                root()
            } content: {
                NavigationStack(path: splitStackBinding(tab)) {
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
            } side: {
                if let side {
                    NavigationStack { routeDestination(side) }
                        .id(side)
                }
            }
        }
    }

    private func splitStackBinding(_ tab: HausTab) -> Binding<[HausRoute]> {
        Binding(
            get: {
                guard case let .split(_, stack, _) = router.panes(tab) else { return [] }
                return stack
            },
            set: { router.setSplitStack($0, for: tab) }
        )
    }

    private func pathBinding(_ tab: HausTab) -> Binding<[HausRoute]> {
        Binding(get: { router.path(tab) }, set: { router.setPath($0, for: tab) })
    }

    private var sheetBinding: Binding<HausSheet?> {
        Binding(get: { router.sheet }, set: { if $0 == nil { router.dismissSheet() } })
    }
}
