import Foundation
import XCTest
@testable import HausModels

final class AgentExecutionEvidenceTests: XCTestCase {
    private let outline = """
    {"durationMs":5000,"runId":"run_1","startedAt":"2026-11-20T10:00:00.000Z","status":"completed",
     "steps":[{"depth":0,"durationMs":1200,"id":"step_1","kind":"tool","label":"Read handler.ts","startOffsetMs":0,
       "status":"completed","toolKind":"file-read"},
      {"depth":0,"id":"step_2","kind":"subagent","label":"Review","startOffsetMs":1300,"status":"running",
       "subagent":{"failedToolCount":1,"label":"reviewer"}},
      {"depth":1,"durationMs":40,"id":"step_3","kind":"reasoning","label":"Thinking","parentId":"step_2",
       "startOffsetMs":1400,"status":"completed"}]}
    """

    private let journal = """
    {"endedAt":"2026-11-20T10:00:05.000Z","failure":{"exitCode":1,"message":"tests failed"},
     "reasoning":[{"id":"r_1","startedAt":"2026-11-20T10:00:00.500Z","text":"Check the limiter.","truncated":false}],
     "runId":"run_1","startedAt":"2026-11-20T10:00:00.000Z","status":"failed",
     "tools":[{"durationMs":900,"endedAt":"2026-11-20T10:00:02.000Z","final":{"observedAt":"2026-11-20T10:00:02.000Z",
         "output":{"stdout":"ok","lines":[1,2]}},"input":{"command":"bun test"},
       "interruptions":[{"at":"2026-11-20T10:00:01.500Z","reason":"stream_error"}],"nativeName":"Bash",
       "startedAt":"2026-11-20T10:00:01.000Z","status":"failed","toolCallId":"call_1","toolName":"shell"},
      {"parentToolCallId":"call_1","startedAt":"2026-11-20T10:00:03.000Z","status":"running",
       "subagent":{"backgrounded":true,"label":"reviewer","startedAt":"2026-11-20T10:00:03.000Z","status":"running",
         "usage":{"durationMs":100,"toolUses":2,"totalTokens":900}},
       "toolCallId":"call_2","toolName":"task"}]}
    """

    func testOutlinesDecodeAvailableAndMissingRuns() throws {
        let outlines = try ContractFixtures.decode(AgentExecutionOutlines.self, """
        {"outlines":[{"outline":\(outline),"runId":"run_1","status":"available"},{"runId":"run_2","status":"missing"}]}
        """)
        guard case let .available(first) = try XCTUnwrap(outlines.outlines.first) else { return XCTFail("Expected an outline") }
        XCTAssertEqual(first.steps.map(\.kind), [.tool, .subagent, .reasoning])
        XCTAssertEqual(first.steps.first?.toolKind, .fileRead)
        XCTAssertEqual(first.steps.last?.parentID, "step_2")
        XCTAssertNil(first.steps[1].durationMs)
        XCTAssertEqual(outlines.outlines.last, .missing(runID: "run_2"))
    }

    func testAnOutlineForAnotherRunOrAToolWithoutAKindFails() {
        XCTAssertThrowsError(try ContractFixtures.decode(AgentExecutionOutlineEntry.self, """
        {"outline":\(outline),"runId":"run_9","status":"available"}
        """))
        let untyped = outline.replacingOccurrences(of: #","toolKind":"file-read""#, with: "")
        XCTAssertThrowsError(try ContractFixtures.decode(AgentExecutionOutline.self, untyped))
    }

    func testTheJournalDecodesToolsReasoningAndRawValues() throws {
        let result = try ContractFixtures.decode(AgentExecutionJournalResult.self, """
        {"agentId":"agent_1","journal":\(journal),"runId":"run_1","status":"available"}
        """)
        guard case let .available(agentID, decoded) = result else { return XCTFail("Expected a journal") }
        XCTAssertEqual(agentID, "agent_1")
        XCTAssertEqual(decoded.failure, ExecutionJournalFailure(exitCode: 1, message: "tests failed"))
        XCTAssertEqual(decoded.reasoning?.first?.text, "Check the limiter.")
        XCTAssertEqual(decoded.tools.first?.input, .object(["command": .string("bun test")]))
        XCTAssertEqual(decoded.tools.first?.finalResult?.output, .object([
            "stdout": .string("ok"), "lines": .array([.number(1), .number(2)]),
        ]))
        XCTAssertEqual(decoded.tools.first?.interruptions?.first?.reason, .streamError)
        XCTAssertEqual(decoded.tools.last?.parentToolCallID, "call_1")
        XCTAssertEqual(decoded.tools.last?.subagent?.backgrounded, true)
        XCTAssertEqual(decoded.tools.last?.subagent?.usage?.totalTokens, 900)
    }

    func testAMissingJournalAndTheChangeEventDecode() throws {
        let missing = try ContractFixtures.decode(AgentExecutionJournalResult.self, #"{"agentId":"agent_1","runId":"run_1","status":"missing"}"#)
        XCTAssertEqual(missing, .missing(agentID: "agent_1", runID: "run_1"))
        let change = try ContractFixtures.decode(AgentExecutionJournalChange.self, #"{"agentId":"agent_1","runId":"run_1"}"#)
        XCTAssertEqual(change.runID, "run_1")
        XCTAssertThrowsError(try ContractFixtures.decode(AgentExecutionJournalResult.self, """
        {"agentId":"agent_1","journal":\(journal),"runId":"run_2","status":"available"}
        """))
    }

    func testEvidenceInputsSendTheirExactShapes() throws {
        let outlines = try XCTUnwrap(AgentExecutionOutlinesInput(agentID: "agent_1", runIDs: ["run_1", "run_2"], serverID: "server_1"))
        XCTAssertEqual(try ContractFixtures.encoded(outlines), try ContractFixtures.object(
            #"{"agentId":"agent_1","runIds":["run_1","run_2"],"serverId":"server_1"}"#
        ))
        XCTAssertNil(AgentExecutionOutlinesInput(agentID: "a", runIDs: [], serverID: "s"))
        XCTAssertNil(AgentExecutionOutlinesInput(agentID: "a", runIDs: ["run_1", "run_1"], serverID: "s"))
        let run = AgentRunTarget(agentID: "agent_1", runID: "run_1", serverID: "server_1")
        XCTAssertEqual(try ContractFixtures.encoded(run), try ContractFixtures.object(
            #"{"agentId":"agent_1","runId":"run_1","serverId":"server_1"}"#
        ))
    }
}
