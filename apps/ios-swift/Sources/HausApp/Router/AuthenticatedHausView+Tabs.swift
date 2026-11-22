import HausAppModel
import HausModels
import HausUI
import SwiftUI

/// The root: five tabs, each with its own `NavigationStack` bound to the
/// router, the "Ask anything" accessory, and the router's one sheet.
extension AuthenticatedHausView {
    var tabShell: some View {
        TabView(selection: $router.selectedTab) {
            Tab(value: HausTab.home) {
                stack(.home) { homeRoot }
            } label: {
                tabIcon("Home", systemImage: "house")
            }
            Tab(value: HausTab.projects) {
                stack(.projects) { projectsRoot }
            } label: {
                tabIcon("Projects", systemImage: "number")
            }
            Tab(value: HausTab.tasks) {
                stack(.tasks) { tasksRoot }
            } label: {
                tabIcon("Tasks", systemImage: "list.bullet")
            }
            Tab(value: HausTab.you) {
                youStack
            } label: {
                (youTabIcon ?? Image(systemName: "person.crop.circle"))
                    .accessibilityLabel("You")
            }
            Tab(value: HausTab.search, role: .search) {
                searchRoot
            } label: {
                tabIcon("Search", systemImage: "magnifyingglass")
            }
        }
        .tabBarMinimizeBehavior(.onScrollDown)
        .askAnythingAccessory(isEnabled: router.showsTabBar) { router.present(.askAnything) }
        .sheet(item: sheetBinding) { routerSheet($0) }
        .task(id: store.settingsData?.viewer.avatarURL) {
            youTabIcon = await TabAvatarImage.image(url: store.settingsData?.viewer.avatarURL)
        }
    }

    func stack<Root: View>(_ tab: HausTab, @ViewBuilder root: () -> Root) -> some View {
        NavigationStack(path: pathBinding(tab)) {
            root().navigationDestination(for: HausRoute.self) { routeDestination($0) }
        }
    }

    private func pathBinding(_ tab: HausTab) -> Binding<[HausRoute]> {
        Binding(get: { router.path(tab) }, set: { router.setPath($0, for: tab) })
    }

    private var sheetBinding: Binding<HausSheet?> {
        Binding(get: { router.sheet }, set: { if $0 == nil { router.dismissSheet() } })
    }

    private func tabIcon(_ title: String, systemImage: String) -> some View {
        Image(systemName: systemImage).accessibilityLabel(title)
    }
}

private struct AskAnythingAccessoryModifier: ViewModifier {
    let isEnabled: Bool
    let action: () -> Void

    func body(content: Content) -> some View {
        if #available(iOS 26.1, *) {
            content.tabViewBottomAccessory(isEnabled: isEnabled) { AskAnythingAccessory(action: action) }
        } else {
            content.tabViewBottomAccessory { AskAnythingAccessory(action: action) }
        }
    }
}

private extension View {
    func askAnythingAccessory(isEnabled: Bool, action: @escaping () -> Void) -> some View {
        modifier(AskAnythingAccessoryModifier(isEnabled: isEnabled, action: action))
    }
}
