import Foundation

/// The filter chips above the Work view.
public enum WorkFilter: CaseIterable, Hashable, Sendable {
    case all
    case workers
    case pullRequests
    case files

    public var title: String {
        switch self {
        case .all: "All"
        case .workers: "Workers"
        case .pullRequests: "Pull requests"
        case .files: "Files"
        }
    }
}

/// One list section the Work view can show.
public enum WorkSection: Hashable, Sendable {
    case running
    /// Every listed pull request in one section, under All.
    case pullRequests
    /// One group of pull requests, under the Pull requests filter.
    case pullRequestGroup(PullRequestGroup)
    case finished
    case files

    public var title: String {
        switch self {
        case .running: "Running"
        case .pullRequests: "Pull requests"
        case .pullRequestGroup(let group): group.title
        case .finished: "Finished"
        case .files: "Files"
        }
    }
}

/// Everything a place's Work view lists, read from the Server's records.
public struct WorkViewContent: Hashable, Sendable {
    public let workers: [WorkWorkerItem]
    public let pullRequests: [PullRequestPresentation]
    public let files: [DriveFilePresentation]

    public init(
        workers: [WorkWorkerItem],
        pullRequests: [PullRequestPresentation],
        files: [DriveFilePresentation]
    ) {
        self.workers = workers
        self.pullRequests = PullRequestPresentation.listed(pullRequests)
        self.files = files
    }

    public var running: [WorkWorkerItem] { workers.filter(\.isRunning) }
    public var finished: [WorkWorkerItem] { workers.filter { !$0.isRunning } }

    public func pullRequests(in group: PullRequestGroup) -> [PullRequestPresentation] {
        pullRequests.filter { $0.group == group }
    }

    /// The sections a filter shows, leaving out any that would be empty.
    public func sections(for filter: WorkFilter) -> [WorkSection] {
        let candidates: [WorkSection] = switch filter {
        case .all: [.running, .pullRequests, .finished, .files]
        case .workers: [.running, .finished]
        case .pullRequests: PullRequestGroup.allCases.map(WorkSection.pullRequestGroup)
        case .files: [.files]
        }
        return candidates.filter { count(of: $0) > 0 }
    }

    public func count(of section: WorkSection) -> Int {
        switch section {
        case .running: running.count
        case .pullRequests: pullRequests.count
        case .pullRequestGroup(let group): pullRequests(in: group).count
        case .finished: finished.count
        case .files: files.count
        }
    }

    /// Whether the section's label carries a count. Files list recents, so a
    /// count would read as the whole drive.
    public func showsCount(_ section: WorkSection) -> Bool { section != .files }
}
