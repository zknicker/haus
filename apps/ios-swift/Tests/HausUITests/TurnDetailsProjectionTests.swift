import Foundation
import HausModels
@testable import HausUI
import Testing

/// What turn details draws from activity, journals, outlines, and settled turns.
struct TurnDetailsProjectionTests {
    private let start = Date(timeIntervalSince1970: 1_800_000_000)

    private func event(
        _ position: Int,
        _ category: AgentActivityCategory,
        _ phase: AgentActivityPhase = .started,
        at seconds: TimeInterval = 0,
        toolRef: String? = nil,
        producer: AgentActivityProducer = .computer
    ) -> AgentActivityEvent {
        AgentActivityEvent(
            agentID: "agent_blippy", category: category, id: "evt_\(position)",
            occurredAt: start.addingTimeInterval(seconds), phase: phase, position: position,
            producer: producer, producerID: "computer", producerSequence: position,
            runID: "run_1", serverID: "srv", toolRef: toolRef
        )
    }

    private func decode<Value: Decodable>(_ json: String) throws -> Value {
        try HausJSON.decoder().decode(Value.self, from: Data(json.utf8))
    }

    @Test func activityReadsAsStepsWithTheCurrentOneLive() {
        let steps = TurnActivitySteps.steps([
            event(1, .working, producer: .server),
            event(2, .checkingMessages, at: 1),
            event(3, .checkingMessages, .completed, at: 2),
            event(4, .thinking, at: 3),
            event(5, .thinking, .completed, at: 15),
            event(6, .readingFiles, at: 16, toolRef: "t1"),
            event(7, .readingFiles, .completed, at: 17, toolRef: "t1"),
            event(8, .readingFiles, at: 18, toolRef: "t2"),
        ], thought: "Reading the 28.1 changelog")

        #expect(steps.map(\.label) == ["Checked messages", "Thought for 12s", "Read files", "Reading the 28.1 changelog"])
        #expect(steps.map(\.isRunning) == [false, false, false, true])
    }

    @Test func repeatedSettledStepsFoldIntoACount() {
        let steps = TurnActivitySteps.steps([
            event(1, .checkingMessages), event(2, .checkingMessages, .completed),
            event(3, .checkingMessages), event(4, .checkingMessages, .completed),
            event(5, .runningCommand), event(6, .runningCommand, .failed),
        ], thought: nil)

        #expect(steps.map(\.label) == ["Checked messages ×2", "Ran a command"])
        #expect(steps.last?.isFailed == true)
    }

    @Test func aJournalNamesEachCallAndFoldsRunsOfOneKind() throws {
        let journal: AgentExecutionJournal = try decode("""
        {"runId":"run_1","startedAt":"2027-01-15T08:00:00.000Z","status":"running","tools":[
          {"toolCallId":"a","toolName":"Read","status":"completed","startedAt":"2027-01-15T08:00:01.000Z","input":{"file_path":"docs/a.md"}},
          {"toolCallId":"b","toolName":"Read","status":"completed","startedAt":"2027-01-15T08:00:02.000Z","input":{"file_path":"docs/b.md"}},
          {"toolCallId":"c","toolName":"Bash","status":"completed","startedAt":"2027-01-15T08:00:20.000Z","input":{"command":"haus message check"}},
          {"toolCallId":"d","toolName":"Read","status":"running","startedAt":"2027-01-15T08:00:30.000Z","input":{"file_path":"releases.md"}},
          {"toolCallId":"e","toolName":"Read","status":"completed","startedAt":"2027-01-15T08:00:31.000Z","parentToolCallId":"d","input":{}}
        ],"reasoning":[
          {"id":"r","startedAt":"2027-01-15T08:00:05.000Z","endedAt":"2027-01-15T08:00:17.000Z","text":"Plan the notes."}
        ]}
        """)

        let steps = TurnJournalSteps.steps(journal)

        #expect(steps.map(\.label) == ["Read 2 files", "Thought for 12s", "Checked messages", "Reading releases.md"])
        #expect(steps[1].detail?.body == "Plan the notes.")
        #expect(steps[2].detail?.body == "haus message check")
        #expect(steps.last?.isRunning == true)
    }

    @Test func anOutlineShowsTopLevelWorkWithoutBookkeeping() throws {
        let outline: AgentExecutionOutline = try decode("""
        {"runId":"run_0","startedAt":"2027-01-15T08:00:00.000Z","durationMs":48000,"status":"completed","steps":[
          {"id":"1","kind":"bookkeeping","label":"Checked messages","depth":0,"startOffsetMs":0,"status":"completed"},
          {"id":"2","kind":"reasoning","label":"Reasoning","depth":0,"startOffsetMs":10,"durationMs":12000,"status":"completed"},
          {"id":"3","kind":"tool","toolKind":"file-read","label":"Read releases.md","depth":0,"startOffsetMs":20,"status":"completed"},
          {"id":"4","kind":"tool","toolKind":"file-read","label":"Read inner.md","depth":1,"parentId":"3","startOffsetMs":21,"status":"completed"}
        ]}
        """)

        #expect(TurnJournalSteps.steps(outline).map(\.label) == ["Thought for 12s", "Read releases.md"])
    }

    @Test func aSettledTurnSaysHowLongAndHowItEnded() throws {
        let turns: [AgentTurn] = try decode("""
        [{"activity":{"operations":[{"category":"reading_files","completed":3,"failed":0,"interrupted":0}]},
          "agentId":"agent_blippy","endedAt":"2027-01-15T08:00:48.000Z","failureKind":null,"messageCount":1,
          "outputProduced":true,"runId":"run_a","startedAt":"2027-01-15T08:00:00.000Z","status":"completed",
          "summary":null,"trigger":null},
         {"activity":{"operations":[]},"agentId":"agent_blippy","endedAt":"2027-01-15T09:02:10.000Z",
          "failureKind":null,"messageCount":0,"outputProduced":false,"runId":"run_b",
          "startedAt":"2027-01-15T09:00:00.000Z","status":"interrupted","summary":null,"trigger":null}]
        """)

        #expect(TurnDetailsCopy.settled(turns[0]) == "Worked for 48s")
        #expect(TurnDetailsCopy.settled(turns[1]) == "Stopped after 2m 10s")
        #expect(TraceFoldLabel.label(turns[0].activity.operations[0]) == "Read 3 files")
        #expect(TurnDetailsCopy.turn(for: turns[0].endedAt.addingTimeInterval(5), in: turns)?.runID == "run_a")
        #expect(TurnDetailsCopy.turn(for: turns[1].startedAt.addingTimeInterval(30), in: turns)?.runID == "run_b")
        #expect(TurnDetailsCopy.turn(for: turns[0].startedAt.addingTimeInterval(-60), in: turns) == nil)
    }

    @Test func theLiveClockTicksFromTheRunStart() {
        #expect(TurnDetailsCopy.working(since: start, now: start.addingTimeInterval(102)) == "Working for 1m 42s")
    }

    @MainActor
    @Test func contentKeepsOnlyAvailableJournalsAndLoadedTurns() throws {
        let content = TurnDetailsContent()
        #expect(!content.hasLoadedTurns(for: "agent_blippy"))

        content.setTurns([], for: "agent_blippy")
        content.setJournal(try decode(#"{"status":"missing","agentId":"agent_blippy","runId":"run_1"}"#))

        #expect(content.hasLoadedTurns(for: "agent_blippy"))
        #expect(content.journalsByRunID.isEmpty)
    }
}
