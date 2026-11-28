import HausModels

/// The You tab's stack seen two ways: the router's routes, and the settings
/// screens the Settings hub pushes and pops on its own. Drive leaves settings
/// for the router's Drive browser, so a folder or file opened from You stacks
/// in You.
public enum YouStack {
    /// The settings screens in `path`, in order.
    public static func settings(in path: [HausRoute]) -> [SettingsRoute] {
        path.compactMap { if case .settings(let route) = $0 { route } else { nil } }
    }

    /// `path` after the hub wrote `settings`: it keeps what both agree on,
    /// drops everything above the first settings screen that changed, and
    /// pushes the new ones. A pushed Drive folder becomes the router's.
    public static func path(_ path: [HausRoute], writing settings: [SettingsRoute]) -> [HausRoute] {
        let current = Self.settings(in: path)
        let kept = zip(current, settings).prefix(while: { $0 == $1 }).count
        let cut = settingsIndices(in: path).dropFirst(kept).first ?? path.endIndex
        return Array(path[..<cut]) + settings.dropFirst(kept).map(route)
    }

    /// A settings screen as You's stack holds it.
    public static func route(_ settings: SettingsRoute) -> HausRoute {
        if case .drive(let prefix) = settings { return .driveFile(path: DrivePath.folder(prefix)) }
        return .settings(settings)
    }

    /// The settings list row a split You selection shows as selected.
    public static func row(selection: HausRoute?) -> SettingsRoute? {
        switch selection {
        case .settings(let settings)?: settings
        case .driveFile(path: "")?: .drive(prefix: "")
        default: nil
        }
    }

    private static func settingsIndices(in path: [HausRoute]) -> [Int] {
        path.indices.filter { if case .settings = path[$0] { true } else { false } }
    }
}
