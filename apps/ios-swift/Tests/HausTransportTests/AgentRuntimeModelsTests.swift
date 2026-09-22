import Foundation
import HausModels
import XCTest
@testable import HausTransport

final class AgentRuntimeModelsTests: XCTestCase {
    func testConfigureAgentInputUsesCurrentServerProcedureShape() throws {
        let input = ConfigureAgentInput(
            agentID: "agent_1",
            modelID: "gpt-5.6-sol",
            reasoningEffort: .xhigh,
            runtimeID: "codex",
            serverID: "server_1"
        )
        let data = try JSONEncoder().encode(input)
        let object = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])

        XCTAssertEqual(Set(object.keys), ["agentId", "modelId", "reasoningEffort", "runtimeId", "serverId"])
        XCTAssertEqual(object["agentId"] as? String, "agent_1")
        XCTAssertEqual(object["modelId"] as? String, "gpt-5.6-sol")
        XCTAssertEqual(object["reasoningEffort"] as? String, "xhigh")
        XCTAssertEqual(object["runtimeId"] as? String, "codex")
        XCTAssertEqual(object["serverId"] as? String, "server_1")
    }
}
