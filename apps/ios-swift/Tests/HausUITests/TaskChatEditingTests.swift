import Foundation
import HausModels
import Testing
@testable import HausUI

struct TaskChatEditingTests {
    @Test func theStatusSheetOffersTheFourStatesTheServerKeeps() {
        #expect(TaskStatusChoice.allCases.map(\.title) == ["Todo", "In progress", "Done", "Canceled"])
        #expect(TaskStatusChoice.allCases.map(\.target) == [.todo, .open, .done, .canceled])
    }

    @Test func eachStateChecksItsOwnRowAndAnUnknownStateChecksNone() {
        for choice in TaskStatusChoice.allCases {
            #expect(TaskStatusChoice(choice.state) == choice)
        }
        #expect(TaskStatusChoice(.unknown) == nil)
    }

    @Test func aLabelTogglesOnAndOffKeepingTheOthersInOrder() throws {
        let task = record(labelIDs: ["a", "b"])

        let removed = try #require(TaskEditPatch.toggling(label: "a", on: task))
        let added = try #require(TaskEditPatch.toggling(label: "c", on: task))

        #expect(removed.labelIDs == ["b"])
        #expect(added.labelIDs == ["a", "b", "c"])
    }

    @Test func aDueDateIsTheReadersDayAndClearingSendsNull() throws {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = try #require(TimeZone(identifier: "America/Los_Angeles"))
        let lateEvening = try #require(calendar.date(from: DateComponents(year: 2026, month: 11, day: 4, hour: 23)))

        #expect(TaskEditPatch.due(lateEvening, calendar: calendar)?.dueOn == .set("2026-11-04"))
        let cleared = try #require(TaskEditPatch.due(nil))
        let json = String(data: try JSONEncoder().encode(cleared), encoding: .utf8)
        #expect(json == #"{"dueOn":null}"#)
    }

    @Test func priorityPatchesNameOnlyThePriority() throws {
        let patch = try #require(TaskEditPatch.priority(.urgent))
        let json = String(data: try JSONEncoder().encode(patch), encoding: .utf8)
        #expect(json == #"{"priority":"urgent"}"#)
    }

    private func record(labelIDs: [String]) -> TaskRecord {
        TaskRecord(
            id: "task_1",
            key: "SEC-1",
            title: "Rotate tokens",
            state: .open,
            serverID: "srv",
            version: 4,
            createdAt: .distantPast,
            updatedAt: .distantPast,
            labelIDs: labelIDs
        )
    }
}
