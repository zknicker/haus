import Foundation
import XCTest
@testable import HausModels

final class AgentRuntimeModelsTests: XCTestCase {
    func testDecodesFullAgentListWithCurrentReasoningEfforts() throws {
        let wireEfforts = ["default", "low", "medium", "high", "xhigh", "max"]
        let objects = wireEfforts.enumerated().map { index, effort in
            """
            {
              "availability":"idle",
              "avatarUrl":null,
              "computerId":"computer_1",
              "createdAt":"2026-08-15T14:00:00Z",
              "createdByUserId":null,
              "description":null,
              "desiredModelId":"model_\(index)",
              "desiredReasoningEffort":"\(effort)",
              "desiredRuntimeId":"runtime_1",
              "displayName":"Agent \(index)",
              "dmChatId":null,
              "effectiveModelId":"model_\(index)",
              "effectiveReasoningEffort":"\(effort)",
              "effectiveReportedAt":null,
              "effectiveRuntimeId":"runtime_1",
              "factoryKind":"ordinary",
              "handle":"agent-\(index)",
              "id":"agent_\(index)",
              "missingResources":[],
              "serverId":"server_1",
              "status":"applied"
            }
            """
        }

        let agents = try HausJSON.decoder().decode(
            [AgentSummary].self,
            from: Data("[\(objects.joined(separator: ","))]".utf8)
        )

        let expectedEfforts = wireEfforts.map { AgentReasoningEffort(rawValue: $0) }
        XCTAssertEqual(agents.map(\.desiredReasoningEffort), expectedEfforts)
        XCTAssertEqual(agents.map(\.effectiveReasoningEffort), expectedEfforts)
    }

    func testResolvesModelSpecificReasoningChoicesAndLegacyInventory() {
        let model = ComputerModelSummary(
            id: "opus",
            label: "Opus",
            defaultReasoningEffort: .max,
            reasoningEfforts: [.medium, .max]
        )
        XCTAssertEqual(modelReasoningEfforts(model), [.medium, .max])
        XCTAssertEqual(modelDefaultReasoningEffort(model), .max)
        XCTAssertEqual(supportedReasoningEffort(for: model, preferred: .low), .max)

        let legacyModel = ComputerModelSummary(id: "legacy", label: "Legacy")
        XCTAssertEqual(modelReasoningEfforts(legacyModel), [.low, .medium, .high])
        XCTAssertEqual(modelDefaultReasoningEffort(legacyModel), .medium)
    }

    func testDecodesCurrentComputerModelReasoningInventory() throws {
        let inventory = try HausJSON.decoder().decode(
            ComputerReportedInventory.self,
            from: Data(
                """
                {
                  "name":"Build Mac",
                  "runtimes":[{
                    "id":"codex",
                    "label":"Codex",
                    "models":[{
                      "defaultReasoningEffort":"xhigh",
                      "id":"gpt-5.6-sol",
                      "label":"GPT-5.6 Sol",
                      "reasoningEfforts":["medium","high","xhigh","max"]
                    }]
                  }]
                }
                """.utf8
            )
        )

        let model = try XCTUnwrap(inventory.runtimes.first?.models.first)
        XCTAssertEqual(model.defaultReasoningEffort, .xhigh)
        XCTAssertEqual(model.reasoningEfforts, [.medium, .high, .xhigh, .max])
    }

    func testValidatesRuntimeConfigurationAgainstReportedInventory() {
        let runtime = ComputerRuntimeSummary(
            id: "claude-code",
            label: "Claude Code",
            models: [
                ComputerModelSummary(
                    id: "haiku",
                    label: "Haiku",
                    reasoningEfforts: [.default]
                ),
            ]
        )

        XCTAssertTrue(
            isAgentRuntimeConfigurationAvailable(
                AgentRuntimeConfiguration(
                    modelID: "haiku",
                    reasoningEffort: .default,
                    runtimeID: "claude-code"
                ),
                in: [runtime]
            )
        )
        XCTAssertFalse(
            isAgentRuntimeConfigurationAvailable(
                AgentRuntimeConfiguration(
                    modelID: "haiku",
                    reasoningEffort: .max,
                    runtimeID: "claude-code"
                ),
                in: [runtime]
            )
        )
    }

    func testReasoningSessionRuleOnlyRotatesGrokBuild() {
        XCTAssertFalse(reasoningChangeResetsSession(runtimeID: "codex"))
        XCTAssertTrue(reasoningChangeResetsSession(runtimeID: "grok-build"))
    }
}
