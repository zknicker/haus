import Foundation

/// The filter chips above the Work view.
public enum WorkFilter: CaseIterable, Hashable, Sendable {
    case all
    case pullRequests
    case files

    public var title: String {
        switch self {
        case .all: "All"
        case .pullRequests: "Pull requests"
        case .files: "Files"
        }
    }
}

/// One list section the Work view can show.
public enum WorkSection: Hashable, Sendable {
    /// Every listed pull request in one section, under All.
    case pullRequests
    /// One group of pull requests, under the Pull requests filter.
    case pullRequestGroup(PullRequestGroup)
    case files

    public var title: String {
        switch self {
        case .pullRequests: "Pull requests"
        case .pullRequestGroup(let group): group.title
        case .files: "Files"
        }
    }
}

/// Everything a place's Work view lists, read from the Server's records.
public struct WorkViewContent: Hashable, Sendable {
    public let pullRequests: [PullRequestPresentation]
    public let files: [DriveFilePresentation]

    public init(pullRequests: [PullRequestPresentation], files: [DriveFilePresentation]) {
        self.pullRequests = PullRequestPresentation.listed(pullRequests)
        self.files = files
    }

    public func pullRequests(in group: PullRequestGroup) -> [PullRequestPresentation] {
        pullRequests.filter { $0.group == group }
    }

    /// The sections a filter shows, leaving out any that would be empty.
    public func sections(for filter: WorkFilter) -> [WorkSection] {
        let candidates: [WorkSection] = switch filter {
        case .all: [.pullRequests, .files]
        case .pullRequests: PullRequestGroup.allCases.map(WorkSection.pullRequestGroup)
        case .files: [.files]
        }
        return candidates.filter { count(of: $0) > 0 }
    }

    public func count(of section: WorkSection) -> Int {
        switch section {
        case .pullRequests: pullRequests.count
        case .pullRequestGroup(let group): pullRequests(in: group).count
        case .files: files.count
        }
    }

    /// Whether the section's label carries a count. Files list recents, so a
    /// count would read as the whole drive.
    public func showsCount(_ section: WorkSection) -> Bool { section != .files }
}
