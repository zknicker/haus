import Foundation
import XCTest
@testable import HausModels

final class ModelConnectionContractTests: XCTestCase {
    private let connection = """
    {"authKind":"oauth","capacity":[{"id":"weekly","label":"Weekly","resetsAt":"2026-11-27T00:00:00.000Z","usedPercent":42.5}],
     "enabled":true,"id":"mc_1","isDefault":true,"label":"Team ChatGPT","position":0,"provider":"chatgpt",
     "status":"ready","statusDetail":null,"updatedAt":"2026-11-20T10:00:00.000Z","webSearch":true}
    """

    func testTheListReadsConnectionsAndTheRunnerCatalog() throws {
        XCTAssertEqual(ModelConnectionProcedures.list.path, "modelConnections.list")
        let read = try ContractFixtures.decode(ModelConnectionsRead.self, """
        {"connections":[\(connection)],"runnerModels":[{"id":"pi","label":"Haus","models":[
          {"contextWindow":400000,"defaultReasoningEffort":"medium","features":["subagents"],"id":"gpt-5.5",
           "label":"GPT-5.5","reasoningEfforts":["low","medium","high"]}]}]}
        """)
        let first = try XCTUnwrap(read.connections.first)
        XCTAssertEqual(first.provider, .chatgpt)
        XCTAssertEqual(first.authKind, .oauth)
        XCTAssertEqual(first.capacity?.first?.usedPercent, 42.5)
        XCTAssertEqual(read.runtimeCatalog.map(\.id), ["pi"])
        XCTAssertEqual(read.runtimeCatalog.first?.models.first?.reasoningEfforts, [.low, .medium, .high])
    }

    func testAComputerLoopServerHasNoRunnerCatalog() throws {
        let read = try ContractFixtures.decode(ModelConnectionsRead.self, #"{"connections":[],"runnerModels":null}"#)
        XCTAssertNil(read.runnerModels)
        XCTAssertEqual(read.runtimeCatalog, [])
        XCTAssertThrowsError(try ContractFixtures.decode(ModelConnectionsRead.self, #"{"connections":[]}"#))
    }

    func testAnUnknownProviderFailsTheConnection() {
        let unknown = connection.replacingOccurrences(of: #""provider":"chatgpt""#, with: #""provider":"mystery""#)
        XCTAssertThrowsError(try ContractFixtures.decode(ModelConnection.self, unknown))
    }

    func testTheUpdatedStreamNamesTheServer() throws {
        let event = try ContractFixtures.decode(ModelConnectionsUpdatedEvent.self, #"{"serverId":"server_1"}"#)
        XCTAssertEqual(event.serverID, "server_1")
        XCTAssertEqual(RealtimeStream.modelConnectionsUpdated.path, "modelConnections.onUpdated")
        XCTAssertFalse(RealtimeStream.modelConnectionsUpdated.joinsLiveSession)
    }
}
