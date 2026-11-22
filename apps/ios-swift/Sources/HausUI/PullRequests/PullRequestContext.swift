import Foundation
import HausModels
import SwiftUI

/// The Captain whose Worker opened a pull request.
public struct PullRequestAuthor: Hashable, Sendable {
    public let captainName: String
    public let tint: Color

    public init(captainName: String, tint: Color) {
        self.captainName = captainName
        self.tint = tint
    }

    /// A Captain whose mark wears the accent until it carries its own color.
    public init(captainName: String) {
        self.init(captainName: captainName, tint: HausPlatformColor.accent)
    }

    public var workerLabel: String { "\(captainName)’s Worker" }
}

/// The Task a pull request was opened for.
public struct PullRequestTaskLink: Hashable, Sendable {
    public let id: String
    public let key: String
    public let title: String
    public let state: TaskState

    public init(id: String, key: String, title: String, state: TaskState) {
        self.id = id
        self.key = key
        self.title = title
        self.state = state
    }

    public init(_ task: TaskRecord) {
        self.init(id: task.id, key: task.key, title: task.title, state: task.state)
    }
}

/// The Worker whose report names a pull request.
public struct PullRequestWorkerLink: Hashable, Sendable {
    public let id: String
    public let summary: String

    public init(id: String, summary: String) {
        self.id = id
        self.summary = summary
    }

    public init(_ worker: WorkerPresentation, now: Date) {
        let line = [WorkWorkerLine.reportPhrase(worker.work.job, now: now), worker.newestRunSummary]
            .compactMap { $0 }
            .joined(separator: " · ")
        self.init(id: worker.id, summary: line)
    }
}

/// What the place knows about a pull request beyond its GitHub reading.
public struct PullRequestContext: Hashable, Sendable {
    public var author: PullRequestAuthor?
    public var headBranch: String?
    public var baseBranch: String?
    public var task: PullRequestTaskLink?
    public var worker: PullRequestWorkerLink?

    public init(
        author: PullRequestAuthor? = nil,
        headBranch: String? = nil,
        baseBranch: String? = nil,
        task: PullRequestTaskLink? = nil,
        worker: PullRequestWorkerLink? = nil
    ) {
        self.author = author
        self.headBranch = headBranch
        self.baseBranch = baseBranch
        self.task = task
        self.worker = worker
    }
}

/// Builds a place's pull requests from the readings of its loaded Tasks and the
/// evidence of its Workers. A Task reading wins over a Worker's snapshot of the
/// same pull request; a Worker's pull request no Task has read still lists.
public enum PullRequestCatalog {
    public static func presentations(
        tasks: [TaskDetail],
        workers: [WorkerPresentation],
        captains: [String: PullRequestAuthor],
        now: Date
    ) -> [PullRequestPresentation] {
        let allWorkers = uniqueWorkers(workers + tasks.flatMap { $0.attachedWork.map { WorkerPresentation(work: $0) } })
        let taskLinks = Dictionary(tasks.map { ($0.task.id, PullRequestTaskLink($0.task)) }) { first, _ in first }

        var seen = Set<String>()
        var entries: [(reading: PullRequestReading, task: PullRequestTaskLink?)] = []
        for detail in tasks {
            for reading in detail.pullRequests where seen.insert(reading.id).inserted {
                entries.append((reading, taskLinks[detail.task.id]))
            }
        }
        for worker in allWorkers {
            guard let reading = workerReading(worker), seen.insert(reading.id).inserted else { continue }
            entries.append((reading, worker.work.taskId.flatMap { taskLinks[$0] }))
        }

        return entries.map { entry in
            let worker = allWorkers.first { opened(entry.reading, by: $0) }
            let context = PullRequestContext(
                author: worker.flatMap { captains[$0.work.agentId] },
                headBranch: worker?.branch?.branch,
                baseBranch: worker?.work.startingRef,
                task: entry.task ?? worker?.work.taskId.flatMap { taskLinks[$0] },
                worker: worker.map { PullRequestWorkerLink($0, now: now) }
            )
            return PullRequestPresentation(reading: entry.reading, context: context)
        }
    }

    static func opened(_ reading: PullRequestReading, by worker: WorkerPresentation) -> Bool {
        guard let branch = worker.branch else { return false }
        if branch.pullRequestUrl == reading.url { return true }
        return branch.repository == reading.repository && worker.pullRequestNumber == reading.number
    }

    /// A Worker's own pull request as a reading: its live numbers, with checks
    /// and review unknown because a Worker snapshot carries neither.
    static func workerReading(_ worker: WorkerPresentation) -> PullRequestReading? {
        guard let branch = worker.branch, let url = branch.pullRequestUrl,
              let pullRequest = worker.pullRequest else { return nil }
        return PullRequestReading(
            number: pullRequest.number,
            repository: branch.repository,
            state: pullRequest.state,
            url: url,
            additions: pullRequest.additions,
            deletions: pullRequest.deletions,
            changedFiles: pullRequest.changedFiles,
            observedAt: pullRequest.observedAt,
            source: .computer
        )
    }

    private static func uniqueWorkers(_ workers: [WorkerPresentation]) -> [WorkerPresentation] {
        var seen = Set<String>()
        return workers.filter { seen.insert($0.id).inserted }
    }
}
