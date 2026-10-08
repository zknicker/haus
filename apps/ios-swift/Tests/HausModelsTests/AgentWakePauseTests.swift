import Foundation
import XCTest
@testable import HausModels

final class AgentWakePauseTests: XCTestCase {
    func testDecodesAPausedAgent() throws {
        let agent = try decodeAgent(wakePause: """
        "wakePause": {
          "failureCount": 3,
          "lastFailure": {"at": "2026-10-07T11:58:00Z", "code": "rate-limited", "kind": "rate-limit"},
          "nextProbeAt": "2026-10-07T12:10:00Z",
          "pausedAt": "2026-10-07T11:58:00Z"
        },
        """)

        let pause = try XCTUnwrap(agent.wakePause)
        XCTAssertEqual(pause.failureCount, 3)
        XCTAssertEqual(pause.lastFailure.code, "rate-limited")
        XCTAssertEqual(pause.lastFailure.kind, "rate-limit")
        XCTAssertEqual(pause.nextProbeAt, HausISO8601.date(from: "2026-10-07T12:10:00Z"))
    }

    func testAProbeInFlightAndAKindOnlyFailureDecode() throws {
        let agent = try decodeAgent(wakePause: """
        "wakePause": {
          "failureCount": 2,
          "lastFailure": {"at": "2026-10-07T11:58:00Z", "code": null, "kind": "some-future-kind"},
          "nextProbeAt": null,
          "pausedAt": "2026-10-07T11:58:00Z"
        },
        """)

        XCTAssertNil(agent.wakePause?.nextProbeAt)
        XCTAssertNil(agent.wakePause?.lastFailure.code)
        XCTAssertEqual(agent.wakePause?.lastFailure.kind, "some-future-kind")
    }

    func testAnUnpausedOrOlderServersAgentHasNoPause() throws {
        XCTAssertNil(try decodeAgent(wakePause: #""wakePause": null,"#).wakePause)
        XCTAssertNil(try decodeAgent(wakePause: "").wakePause)
    }

    private func decodeAgent(wakePause: String) throws -> AgentSummary {
        let json = """
        {
          \(wakePause)
          "availability": "error",
          "avatarUrl": null,
          "computerId": "computer_1",
          "createdAt": "2026-08-15T14:00:00Z",
          "createdByUserId": null,
          "description": null,
          "desiredModelId": "model_1",
          "desiredRuntimeId": "runtime_1",
          "displayName": "Cove",
          "dmChatId": null,
          "effectiveModelId": null,
          "effectiveReportedAt": null,
          "effectiveRuntimeId": null,
          "factoryKind": "ordinary",
          "handle": "cove",
          "id": "agent_1",
          "missingResources": [],
          "serverId": "server_1",
          "status": "applied"
        }
        """
        return try HausJSON.decoder().decode(AgentSummary.self, from: Data(json.utf8))
    }
}
