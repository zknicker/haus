import HausModels

/// The screen a route draws.
public enum RouteScreen: Hashable, Sendable {
    case conversation
    case task(taskID: String)
    case work(HausWorkPlace)
    case pullRequest(PullRequestReading)
    /// A Drive folder's listing, by its prefix (`projects/haus/`).
    case driveFolder(prefix: String)
    /// One Drive file's preview, by its path.
    case driveFile(path: String)
    case projectSettings(projectID: String)
    /// A settings screen as You's content pane shows it beside the list.
    case settings(SettingsRoute)

    public init(_ route: HausRoute) {
        switch route {
        case .captain, .channel, .dm: self = .conversation
        case .task(let taskID, _): self = .task(taskID: taskID)
        case .work(let place): self = .work(place)
        case .pullRequest(let reading): self = .pullRequest(reading)
        case .driveFile(let path): self = DrivePath.isFolder(path) ? .driveFolder(prefix: path) : .driveFile(path: path)
        case .projectSettings(let projectID): self = .projectSettings(projectID: projectID)
        case .settings(let settings): self = .settings(settings)
        }
    }
}

/// Drive paths as routes carry them: a folder ends in `/` (or is the root),
/// anything else names a file.
public enum DrivePath {
    public static func isFolder(_ path: String) -> Bool {
        path.isEmpty || path.hasSuffix("/")
    }

    /// The route path that opens a folder's listing.
    public static func folder(_ path: String) -> String {
        path.isEmpty || path.hasSuffix("/") ? path : "\(path)/"
    }
}
