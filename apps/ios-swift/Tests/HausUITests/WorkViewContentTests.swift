import Foundation
import HausModels
import SwiftUI
import Testing
@testable import HausUI

struct WorkViewContentTests {
    @Test func allShowsEveryNonEmptySectionInMockOrder() throws {
        let content = WorkViewContent(
            workers: [try WorkFixture.item(id: "w1", job: .working), try WorkFixture.item(id: "w2", job: .done)],
            pullRequests: [PullRequestFixture.presentation(number: 1)],
            files: []
        )
        #expect(content.sections(for: .all) == [.running, .pullRequests, .finished])
        #expect(content.count(of: .running) == 1)
        #expect(content.count(of: .finished) == 1)
    }

    @Test func pullRequestsFilterGroupsAndSkipsEmptyGroups() {
        let content = WorkViewContent(
            workers: [],
            pullRequests: [
                PullRequestFixture.presentation(number: 1, state: "draft"),
                PullRequestFixture.presentation(number: 2),
                PullRequestFixture.presentation(number: 3, state: "closed"),
            ],
            files: []
        )
        #expect(content.sections(for: .pullRequests) == [.pullRequestGroup(.ready), .pullRequestGroup(.draft)])
        #expect(content.count(of: .pullRequests) == 2)
    }

    @Test func workersFilterLeavesOutPullRequestsAndFiles() throws {
        let content = WorkViewContent(
            workers: [try WorkFixture.item(id: "w1", job: .needsInput)],
            pullRequests: [PullRequestFixture.presentation(number: 1)],
            files: []
        )
        #expect(content.sections(for: .workers) == [.running])
        #expect(content.sections(for: .files).isEmpty)
    }

    @Test func filesSectionCarriesNoCount() {
        let content = WorkViewContent(workers: [], pullRequests: [], files: [])
        #expect(!content.showsCount(.files))
        #expect(content.showsCount(.running))
    }

    @Test func workerRowMetaReadsDurationPlaceAndTaskKey() throws {
        let start = WorkFixture.start
        let running = try WorkFixture.item(id: "w1", job: .working, computerName: "mini", taskKey: "HAUS-41")
        #expect(WorkWorkerLine.meta(running, now: start.addingTimeInterval(360)) == ["Working for 6m", "mini", "HAUS-41"])
        let finished = try WorkFixture.item(id: "w2", job: .done, runtime: "claude-code", taskKey: "HAUS-39")
        #expect(WorkWorkerLine.meta(finished, now: start) == ["Worked for 28m", "Claude Code", "HAUS-39"])
    }
}

struct PullRequestCatalogTests {
    @Test func taskReadingWinsOverTheWorkerSnapshotAndPicksUpItsContext() throws {
        let worker = try WorkFixture.worker(id: "w1", job: .done, taskID: "tsk_1", startingRef: "main", pullRequest: 441)
        let detail = WorkFixture.taskDetail(id: "tsk_1", workers: [worker.work], readings: [
            PullRequestFixture.reading(number: 441, title: "Require iOS 26"),
        ])
        let author = PullRequestAuthor(captainName: "Forge", tint: .purple)

        let presentations = PullRequestCatalog.presentations(
            tasks: [detail], workers: [worker], captains: ["agt_forge": author], now: WorkFixture.start
        )

        let pullRequest = try #require(presentations.only)
        #expect(pullRequest.title == "Require iOS 26")
        #expect(pullRequest.reading.source == .github)
        #expect(pullRequest.context.author == author)
        #expect(pullRequest.context.task?.key == "HAUS-39")
        #expect(pullRequest.context.worker?.id == "w1")
        #expect(pullRequest.context.worker?.summary == "Finished, worked for 28m")
        #expect(pullRequest.branchText == "haus/ios-26-min \u{2192} main")
    }

    @Test func workerPullRequestNoTaskReadStillListsWithItsTask() throws {
        let worker = try WorkFixture.worker(id: "w1", job: .working, taskID: "tsk_1", pullRequest: 443)
        let detail = WorkFixture.taskDetail(id: "tsk_1", workers: [], readings: [])

        let presentations = PullRequestCatalog.presentations(
            tasks: [detail], workers: [worker], captains: [:], now: WorkFixture.start
        )

        let pullRequest = try #require(presentations.only)
        #expect(pullRequest.reading.number == 443)
        #expect(pullRequest.reading.source == .computer)
        #expect(pullRequest.reading.checks == "unknown")
        #expect(pullRequest.group == .ready)
        #expect(pullRequest.context.task?.id == "tsk_1")
    }
}

enum WorkFixture {
    enum Job { case working, done, needsInput }

    static let start = Date(timeIntervalSince1970: 1_790_000_000)

    static func item(
        id: String,
        job: Job,
        computerName: String? = nil,
        runtime: String? = nil,
        taskKey: String? = nil
    ) throws -> WorkWorkerItem {
        WorkWorkerItem(
            worker: try worker(id: id, job: job, computerName: computerName, runtime: runtime),
            taskKey: taskKey
        )
    }

    static func worker(
        id: String,
        job: Job,
        computerName: String? = nil,
        runtime: String? = nil,
        taskID: String? = nil,
        startingRef: String? = nil,
        pullRequest: Int? = nil
    ) throws -> WorkerPresentation {
        let started = iso(start.addingTimeInterval(-28 * 60))
        let now = iso(start)
        let jobJSON = switch job {
        case .working: #"{"followUp":null,"startedAt":"\#(iso(start))","state":"working"}"#
        case .done: #"{"followUp":null,"settledAt":"\#(now)","startedAt":"\#(started)","state":"done"}"#
        case .needsInput: #"{"followUp":null,"question":null,"settledAt":null,"startedAt":"\#(started)","state":"pending-input"}"#
        }
        let place = computerName.map { #"{"kind":"computer","computerId":"cmp_1","computerName":"\#($0)"}"# }
            ?? #"{"kind":"claude"}"#
        let snapshot = pullRequest.map {
            #"{"additions":38,"changedFiles":14,"deletions":612,"number":\#($0),"state":"open","observedAt":"\#(now)"}"#
        }
        let branches = pullRequest.map {
            #"[{"branch":"haus/ios-26-min","repository":"haus/haus","pullRequestUrl":"https://github.com/haus/haus/pull/\#($0)","pullRequest":null}]"#
        } ?? "[]"
        let json = """
        {"activity":null,"agentId":"agt_forge","taskId":\(quoted(taskID)),"createdAt":"\(started)","id":"\(id)",
         "job":\(jobJSON),"place":\(place),"providerUrl":null,"pullRequests":\(snapshot.map { "[\($0)]" } ?? "[]"),
         "repository":"haus/haus","turns":[{"branches":\(branches),"createdAt":"\(started)","errorCode":null,
         "turnId":"run_1","startedAt":"\(started)","status":"completed","stopRequestedAt":null,"summary":null,
         "terminalAt":null}],"startedAt":"\(started)","startingRef":\(quoted(startingRef)),"status":"done",
         "terminalAt":null,"title":"Raise minimum to iOS 26","updatedAt":"\(now)","runtime":\(quoted(runtime))}
        """
        return WorkerPresentation(work: try HausJSON.decoder().decode(Worker.self, from: Data(json.utf8)))
    }

    static func taskDetail(id: String, workers: [Worker], readings: [PullRequestReading]) -> TaskDetail {
        TaskDetail(
            task: TaskRecord(
                id: id, key: "HAUS-39", title: "Raise minimum to iOS 26", state: .open,
                serverID: "srv_1", version: 1, createdAt: start, updatedAt: start
            ),
            mentions: [],
            reminders: [],
            attachedWork: workers,
            pullRequests: readings
        )
    }

    private static func iso(_ date: Date) -> String { HausISO8601.string(from: date) }

    private static func quoted(_ value: String?) -> String { value.map { "\"\($0)\"" } ?? "null" }
}

extension Array {
    fileprivate var only: Element? { count == 1 ? first : nil }
}
