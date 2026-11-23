import Foundation
import Testing
@testable import HausUI

@Suite struct WorkerViewStepFoldTests {
    private func read(_ path: String) -> WorkerStepEntry { WorkerStepEntry(kind: .read, label: path) }

    @Test func consecutiveReadsFoldIntoOneCountedLine() {
        let steps = (1...6).map { read("apps/ios-swift/Sources/File\($0).swift") } + [
            WorkerStepEntry(kind: .edit, label: "apps/ios-swift/Sources/HausRouter.swift", additions: 40, deletions: 2),
            WorkerStepEntry(kind: .run, label: "swift test"),
        ]

        let titles = WorkerStepFold.groups(steps, live: false).map(\.title)

        #expect(titles == ["Read 6 files", "Edited HausRouter.swift", "Ran swift test"])
    }

    @Test func repeatedEditsOfOneFileNameThatFile() {
        let path = "Sources/HausRouter.swift"
        let steps = [
            WorkerStepEntry(kind: .edit, label: path),
            WorkerStepEntry(kind: .edit, label: path),
        ]

        #expect(WorkerStepFold.groups(steps, live: false).map(\.title) == ["Edited HausRouter.swift"])
    }

    @Test func kindsFoldOnlyWhenAdjacent() {
        let steps = [read("a.swift"), WorkerStepEntry(kind: .search, label: "HausRouter"), read("b.swift")]

        #expect(WorkerStepFold.groups(steps, live: false).map(\.title) == [
            "Read a.swift", "Searched HausRouter", "Read b.swift",
        ])
    }

    @Test func pluralsNameWhatEachKindActsOn() {
        let runs = [WorkerStepEntry(kind: .run, label: "bun test"), WorkerStepEntry(kind: .run, label: "bun lint")]
        let searches = [WorkerStepEntry(kind: .search, label: "a"), WorkerStepEntry(kind: .search, label: "b")]

        #expect(WorkerStepFold.groups(runs, live: false).map(\.title) == ["Ran 2 commands"])
        #expect(WorkerStepFold.groups(searches, live: false).map(\.title) == ["Searched 2 queries"])
    }

    @Test func theLiveTurnsRunningStepStandsAloneInThePresentTense() {
        let steps = [
            read("Sources/HausStoreServerReload.swift"),
            WorkerStepEntry(kind: .edit, label: "Sources/HausRouter+Servers.swift", state: .running),
        ]

        let groups = WorkerStepFold.groups(steps, live: true)

        #expect(groups.map(\.title) == ["Read HausStoreServerReload.swift", "Editing HausRouter+Servers.swift"])
        #expect(groups.map(\.isCurrent) == [false, true])
    }

    @Test func aCurrentStepNeverFoldsIntoItsNeighbours() {
        let steps = [read("a.swift"), read("b.swift"), WorkerStepEntry(kind: .read, label: "c.swift", state: .running)]

        let groups = WorkerStepFold.groups(steps, live: true)

        #expect(groups.map(\.title) == ["Read 2 files", "Reading c.swift"])
    }

    @Test func aSettledTurnHasNoCurrentStepEvenIfOneNeverReportedDone() {
        let steps = [WorkerStepEntry(kind: .run, label: "bun test", state: .running)]

        let groups = WorkerStepFold.groups(steps, live: false)

        #expect(groups.map(\.title) == ["Ran bun test"])
        #expect(groups.allSatisfy { !$0.isCurrent })
    }

    @Test func aFailedStepMarksItsLine() {
        let steps = [WorkerStepEntry(kind: .run, label: "swift test", state: .failed)]

        #expect(WorkerStepFold.groups(steps, live: false).first?.failed == true)
    }
}
