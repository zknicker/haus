import Foundation
@testable import HausModels
import Testing

struct ComputerWorkersContractTests {
    @Test func setWorkersNamesItsServerPath() {
        #expect(ComputerWorkersProcedures.setWorkers.path == "computer.setWorkers")
        #expect(ComputerWorkersProcedures.setWorkers.kind == .mutation)
    }

    @Test func setWorkersEncodesTheWireKeys() throws {
        let input = ComputerSetWorkersInput(computerID: "cmp_1", enabled: false, serverID: "srv_1")
        let object = try JSONSerialization.jsonObject(with: HausJSON.encoder().encode(input)) as? [String: Any]
        #expect(object?["computerId"] as? String == "cmp_1")
        #expect(object?["serverId"] as? String == "srv_1")
        #expect(object?["enabled"] as? Bool == false)
        #expect(object?.count == 3)
    }

    @Test func aComputerReadsItsWorkersSwitch() throws {
        let computer = try HausJSON.decoder().decode(ComputerSummary.self, from: Data(Self.computer(workers: """
        ,"workersEnabled":true,"canChangeWorkers":false,"workerLimit":4
        """).utf8))
        #expect(computer.workersEnabled == true)
        #expect(computer.canChangeWorkers == false)
    }

    @Test func aComputerFromAnOlderServerHasNoSwitch() throws {
        let computer = try HausJSON.decoder().decode(ComputerSummary.self, from: Data(Self.computer(workers: "").utf8))
        #expect(computer.workersEnabled == nil)
        #expect(computer.canChangeWorkers == nil)
    }

    private static func computer(workers: String) -> String {
        """
        {"architecture":"arm64","createdAt":"2026-08-15T14:00:00Z","health":"healthy","id":"cmp_1",
        "lastConnectedAt":null,"name":"mini","operatingSystem":"darwin","productVersion":"1.4.0",
        "protocolVersion":2,"reportedInventory":null,"updateDetail":null,"updateDownloadedBytes":null,
        "updateFailedPhase":null,"updatePhase":"idle","updateActiveAgentCount":null,"updateTargetVersion":null,
        "updateTotalBytes":null,"updateUpdatedAt":null\(workers)}
        """
    }
}
