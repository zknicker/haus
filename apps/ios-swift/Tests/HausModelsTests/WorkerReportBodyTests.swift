import Foundation
import Testing
@testable import HausModels

struct WorkerReportBodyTests {
    @Test func aWorkerReportBodyNamesItsWorkerTurnAndOutcome() throws {
        let json = #"{"kind":"worker-report","outcome":"needs-you","turnId":"wkt_1","workerId":"wrk_1"}"#
        let body = try HausJSON.decoder().decode(ChatMessageBody.self, from: Data(json.utf8))
        #expect(body == .workerReport(workerID: "wrk_1", turnID: "wkt_1", outcome: .needsYou))

        let encoded = try HausJSON.encoder().encode(body)
        #expect(try HausJSON.decoder().decode(ChatMessageBody.self, from: encoded) == body)
    }

    @Test func aFollowUpBodyStaysUnsupported() throws {
        let json = #"{"kind":"worker-follow-up","workerId":"wrk_1"}"#
        #expect(try HausJSON.decoder().decode(ChatMessageBody.self, from: Data(json.utf8)) == .unsupported("worker-follow-up"))
    }
}
