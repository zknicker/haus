import Foundation
import XCTest
@testable import HausModels

final class AgentReasoningEffortTests: XCTestCase {
    func testDecodesAgentsWithEveryServerReasoningEffort() throws {
        let json = """
        {
          "availability": "working",
          "avatarUrl": "https://example.com/cove.png",
          "computerId": "computer_1",
          "createdAt": "2026-08-15T14:00:00.123Z",
          "createdByUserId": "user_1",
          "description": "Onboarding assistant",
          "desiredModelId": "model_1",
          "desiredRuntimeId": "runtime_1",
          "displayName": "Cove",
          "dmChatId": "chat_1",
          "effectiveModelId": "model_1",
          "effectiveReportedAt": "2026-08-15T14:00:01+00:00",
          "effectiveRuntimeId": "runtime_1",
          "factoryKind": "cove",
          "handle": "cove-agent",
          "id": "agent_1",
          "missingResources": [],
          "role": "admin",
          "serverId": "server_1",
          "status": "applied"
        }
        """

        for effort in ["default", "low", "medium", "high", "xhigh", "max"] {
            var payload = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(json.utf8)) as? [String: Any])
            payload["desiredReasoningEffort"] = effort
            let configuredAgent = try HausJSON.decoder().decode(
                AgentSummary.self, from: JSONSerialization.data(withJSONObject: payload)
            )
            XCTAssertEqual(configuredAgent.desiredReasoningEffort?.rawValue, effort)
        }
    }
}
