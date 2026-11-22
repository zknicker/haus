import Foundation

/// One of Drive's three areas (`specs/artifact-drive.md`): the team's
/// `haus/`, a Project's `projects/<key>/`, or a Captain's `agents/<handle>/`.
public enum DriveArea: Hashable, Sendable, Comparable {
    case haus
    case project(key: String)
    case agent(handle: String)

    /// The area a path sits in by its prefix, or nil for a path outside every
    /// area, such as the bare `projects` folder at the drive root.
    public init?(path: String) {
        let segments = path.split(separator: "/", omittingEmptySubsequences: false).map(String.init)
        switch segments.first?.lowercased() {
        case "haus":
            self = .haus
        case "projects" where segments.count >= 2 && !segments[1].isEmpty:
            self = .project(key: segments[1])
        case "agents" where segments.count >= 2 && !segments[1].isEmpty:
            self = .agent(handle: segments[1])
        default:
            return nil
        }
    }

    /// The area's folder, which is also how it is labeled: `projects/product`.
    public var path: String {
        switch self {
        case .haus: "haus"
        case .project(let key): "projects/\(key)"
        case .agent(let handle): "agents/\(handle)"
        }
    }

    public static func < (lhs: DriveArea, rhs: DriveArea) -> Bool {
        if lhs.rank != rhs.rank { return lhs.rank < rhs.rank }
        return lhs.name.localizedStandardCompare(rhs.name) == .orderedAscending
    }

    private var rank: Int {
        switch self {
        case .haus: 0
        case .project: 1
        case .agent: 2
        }
    }

    private var name: String {
        switch self {
        case .haus: ""
        case .project(let key): key
        case .agent(let handle): handle
        }
    }
}

/// A run of items that share an area, in the order they were listed. A nil
/// area holds whatever sits outside the areas, like the drive root's folders.
public struct DriveAreaSection<Item> {
    public let area: DriveArea?
    public let items: [Item]

    public var title: String { area?.path ?? "Drive" }

    /// Groups `items` by area: outside-area items first, then `haus`, Projects
    /// by key, and Captains by handle. Items keep their listed order inside a
    /// section, so a newest-first listing stays newest first.
    public static func group(_ items: [Item], path: (Item) -> String) -> [DriveAreaSection<Item>] {
        var order: [DriveArea?] = []
        var buckets: [DriveArea?: [Item]] = [:]
        for item in items {
            let area = DriveArea(path: path(item))
            if buckets[area] == nil { order.append(area) }
            buckets[area, default: []].append(item)
        }
        return order
            .sorted { lhs, rhs in
                switch (lhs, rhs) {
                case (nil, _): rhs != nil
                case (_, nil): false
                case let (lhs?, rhs?): lhs < rhs
                }
            }
            .map { DriveAreaSection(area: $0, items: buckets[$0] ?? []) }
    }
}

extension DriveAreaSection: Equatable where Item: Equatable {}
extension DriveAreaSection: Sendable where Item: Sendable {}
