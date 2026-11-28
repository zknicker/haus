import Foundation
import XCTest
@testable import HausModels

final class AgentContractTests: XCTestCase {
    private func turn(trigger: String) -> String {
        """
        {"activity":{"operations":[{"category":"generating_image","completed":1,"failed":0,"interrupted":0}]},
         "agentId":"agent_1","endedAt":"2026-11-20T10:05:00.000Z","failureKind":null,"messageCount":2,
         "outputProduced":true,"runId":"run_1","startedAt":"2026-11-20T10:00:00.000Z","status":"completed",
         "summary":"Shipped it.","trigger":\(trigger)}
        """
    }

    func testEveryAgentProcedureNamesItsServerPath() {
        XCTAssertEqual(AgentProcedures.turns.path, "agent.turns")
        XCTAssertEqual(AgentProcedures.activityHistory.path, "agent.activityHistory")
        XCTAssertEqual(AgentProcedures.activeActivity.path, "agent.activeActivity")
        XCTAssertEqual(AgentProcedures.create.path, "agent.create")
        XCTAssertEqual(AgentProcedures.create.kind, .mutation)
        XCTAssertEqual(AgentProcedures.stop.path, "agent.stop")
        XCTAssertEqual(AgentProcedures.stop.kind, .mutation)
        XCTAssertEqual(AgentProcedures.configure.path, "agent.configure")
        XCTAssertEqual(AgentProcedures.executionOutlines.path, "agent.executionOutlines")
        XCTAssertEqual(AgentProcedures.executionJournal.path, "agent.executionJournal")
        XCTAssertEqual(AgentProcedures.executionJournal.kind, .query)
    }

    func testTurnsDecodeEachTriggerKind() throws {
        let message = #"{"author":"human","chatId":"chat_1","kind":"message","messageId":"msg_1","preview":{"attachmentCount":1,"content":"Ship it"}}"#
        let issue = #"{"code":"GEN-12","issueId":"iss_12","kind":"issue","more":2,"title":"Rate-limit"}"#
        let pullRequest = #"{"chatId":"chat_1","kind":"pull_request"}"#
        let triggers = [message, issue, pullRequest, #"{"kind":"private"}"#, "null"]
        let turns = try ContractFixtures.decode([AgentTurn].self, "[\(triggers.map { turn(trigger: $0) }.joined(separator: ","))]")
        XCTAssertEqual(turns[0].trigger, .message(
            author: .human, chatID: "chat_1", messageID: "msg_1",
            preview: AgentTurnTriggerPreview(attachmentCount: 1, content: "Ship it")
        ))
        XCTAssertEqual(turns[1].trigger, .issue(code: "GEN-12", issueID: "iss_12", title: "Rate-limit", more: 2))
        XCTAssertEqual(turns[2].trigger, .pullRequest(chatID: "chat_1"))
        XCTAssertEqual(turns[3].trigger, .hidden)
        XCTAssertNil(turns[4].trigger)
        XCTAssertEqual(turns[0].activity.operations.first?.category, .generatingImage)
        XCTAssertEqual(turns[0].status, .completed)
    }

    func testAnUnknownTriggerKindFailsTheTurn() {
        XCTAssertThrowsError(try ContractFixtures.decode(AgentTurn.self, turn(trigger: #"{"kind":"telepathy"}"#)))
    }

    func testActivityHistoryCarriesItsRunTriggers() throws {
        let page = try ContractFixtures.decode(AgentActivityHistoryPage.self, """
        {"events":[],"nextBefore":{"position":4,"runId":"run_1"},
         "runTriggers":[{"runId":"run_1","trigger":{"chatId":"chat_1","kind":"reminder"}},{"runId":"run_2","trigger":null}]}
        """)
        XCTAssertEqual(page.nextBefore, AgentActivityCursor(position: 4, runID: "run_1"))
        XCTAssertEqual(page.runTriggers.first?.trigger, .reminder(chatID: "chat_1"))
        XCTAssertNil(page.runTriggers.last?.trigger)
    }

    func testTheActiveSnapshotCarriesRunStartedAtAndDelegations() throws {
        let snapshot = try ContractFixtures.decode(AgentActiveActivitySnapshot.self, """
        {"activities":[{"activeDelegations":[{"operationId":"0123456789abcdef","startedAt":"2026-11-20T10:01:00.000Z"}],
          "agentId":"agent_1","category":"delegating","id":"act_1","occurredAt":"2026-11-20T10:01:00.000Z",
          "operationId":"0123456789abcdef","phase":"started","position":3,"producer":"computer","producerId":"cmp_1",
          "producerSequence":2,"runId":"run_1","runStartedAt":"2026-11-20T10:00:00.000Z","serverId":"server_1"}]}
        """)
        let current = try XCTUnwrap(snapshot.current.first)
        XCTAssertEqual(current.runStartedAt, HausISO8601.date(from: "2026-11-20T10:00:00.000Z"))
        XCTAssertEqual(current.activeDelegations.first?.operationID, "0123456789abcdef")
        XCTAssertEqual(snapshot.activities.map(\.runID), ["run_1"])
        XCTAssertThrowsError(try ContractFixtures.decode(AgentActiveActivitySnapshot.self, """
        {"activities":[{"agentId":"agent_1","category":"working","id":"act_1","occurredAt":"2026-11-20T10:01:00.000Z",
          "phase":"started","position":3,"producer":"server","producerId":"srv","producerSequence":2,"runId":"run_1",
          "serverId":"server_1"}]}
        """))
    }

    func testReadInputsSendTheirExactShapes() throws {
        let turns = try XCTUnwrap(AgentTurnsInput(agentID: "agent_1", serverID: "server_1", limit: 20, runID: "run_1"))
        XCTAssertEqual(try ContractFixtures.encoded(turns), try ContractFixtures.object(
            #"{"agentId":"agent_1","limit":20,"runId":"run_1","serverId":"server_1"}"#
        ))
        XCTAssertNil(AgentTurnsInput(agentID: "a", serverID: "s", limit: 51))
        let cursor = AgentActivityCursor(position: 4, runID: "run_1")
        let history = try XCTUnwrap(AgentActivityHistoryInput(agentId: "agent_1", serverId: "server_1", before: cursor, runId: "run_1"))
        XCTAssertEqual(try ContractFixtures.encoded(history), try ContractFixtures.object(
            #"{"agentId":"agent_1","before":{"position":4,"runId":"run_1"},"limit":30,"runId":"run_1","serverId":"server_1"}"#
        ))
        XCTAssertNil(AgentActivityHistoryInput(agentId: "a", serverId: "s", before: cursor, runId: "run_2"))
        XCTAssertEqual(try ContractFixtures.encoded(AgentTarget(agentID: "agent_1", serverID: "server_1")), try ContractFixtures.object(
            #"{"agentId":"agent_1","serverId":"server_1"}"#
        ))
    }

    func testCreateSendsTheAgentAndRefusesAReservedHandle() throws {
        let input = try XCTUnwrap(CreateAgentInput(
            computerID: "cmp_1", displayName: "Forge", handle: "forge", homeProjectID: "project_sec",
            modelID: "claude-opus-5-5", reasoningEffort: .high, runtimeID: "claude-code", serverID: "server_1",
            avatar: AgentAvatarUpload(bytesBase64: "AAAA", mediaType: .png)
        ))
        XCTAssertEqual(try ContractFixtures.encoded(input), try ContractFixtures.object(
            """
            {"avatar":{"bytesBase64":"AAAA","mediaType":"image/png"},"computerId":"cmp_1","displayName":"Forge",
             "handle":"forge","homeProjectId":"project_sec","modelId":"claude-opus-5-5","reasoningEffort":"high",
             "runtimeId":"claude-code","serverId":"server_1"}
            """
        ))
        XCTAssertNil(CreateAgentInput(
            computerID: "c", displayName: "Haus", handle: "haus", homeProjectID: "p", modelID: "m", runtimeID: "r", serverID: "s"
        ))
        XCTAssertNil(CreateAgentInput(
            computerID: "c", displayName: "  ", handle: "forge", homeProjectID: "p", modelID: "m", runtimeID: "r", serverID: "s"
        ))
    }

    func testStopAnswersWithDeliveryStateAndUpdatesNameTheAgent() throws {
        let state = try ContractFixtures.decode(AgentDeliveryState.self, #"{"agentId":"agent_1","pending":2,"running":false,"stopped":true}"#)
        XCTAssertTrue(state.stopped)
        XCTAssertEqual(state.pending, 2)
        let roster = try ContractFixtures.decode(AgentUpdatedEvent.self, #"{"agentId":null,"serverId":"server_1"}"#)
        XCTAssertNil(roster.agentID)
        XCTAssertThrowsError(try ContractFixtures.decode(AgentUpdatedEvent.self, #"{"serverId":"server_1"}"#))
    }

    func testTheAgentStreamsWaitOutsideTheLiveSession() {
        XCTAssertEqual(RealtimeStream.agentUpdated.path, "agent.onUpdated")
        XCTAssertEqual(RealtimeStream.agentExecutionJournal.path, "agent.onExecutionJournal")
        XCTAssertFalse(RealtimeStream.agentUpdated.joinsLiveSession)
        XCTAssertFalse(RealtimeStream.agentExecutionJournal.joinsLiveSession)
        XCTAssertFalse(RealtimeStream.liveSession.contains(.agentExecutionJournal))
    }
}
