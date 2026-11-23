import Foundation
import XCTest
@testable import HausModels

final class WorkerContractTests: XCTestCase {
    func testEveryWorkerProcedureNamesItsServerPath() {
        XCTAssertEqual(WorkerProcedures.get.path, "worker.get")
        XCTAssertEqual(WorkerProcedures.listActive.path, "worker.listActive")
        XCTAssertEqual(WorkerProcedures.listForChat.path, "worker.listForChat")
        XCTAssertEqual(WorkerProcedures.listLinks.path, "worker.listLinks")
        XCTAssertEqual(WorkerProcedures.sendFollowUp.path, "worker.sendFollowUp")
        XCTAssertEqual(WorkerProcedures.sendFollowUp.kind, .mutation)
        XCTAssertEqual(WorkerProcedures.stop.path, "worker.stop")
        XCTAssertEqual(WorkerProcedures.stop.kind, .mutation)
    }

    func testAWorkerDecodesItsRecordFactsAndNewestTurn() throws {
        let worker = try ContractFixtures.decode(Worker.self, ContractFixtures.worker())
        XCTAssertEqual(worker.workerStatus, .working)
        XCTAssertEqual(worker.status, .running)
        XCTAssertEqual(worker.branch, "haus/rate-limit")
        XCTAssertEqual(worker.runtime, .codex)
        XCTAssertEqual(worker.model, "gpt-5.5")
        XCTAssertEqual(worker.place.computerName, "Studio")
        XCTAssertEqual(worker.job.followUp?.state, .stalled)
        XCTAssertEqual(worker.runs.first?.branches.first?.pullRequestUrl, "https://github.com/haus/haus/pull/42")
        XCTAssertEqual(worker.pullRequest?.number, 42)
    }

    func testAPlaceDecodesOnlyTheThreeKnownKinds() throws {
        let cloud = try ContractFixtures.decode(Worker.self, ContractFixtures.worker(place: #"{"kind":"claude"}"#))
        XCTAssertEqual(cloud.provider, "claude")
        XCTAssertNil(cloud.place.computerId)
        XCTAssertThrowsError(try ContractFixtures.decode(Worker.self, ContractFixtures.worker(place: #"{"kind":"mars"}"#)))
        XCTAssertThrowsError(try ContractFixtures.decode(Worker.self, ContractFixtures.worker(place: #"{"kind":"computer"}"#)))
    }

    func testAnUnknownRecordStatusFailsTheWorker() {
        let json = ContractFixtures.worker().replacingOccurrences(of: #""status":"working""#, with: #""status":"paused""#)
        XCTAssertThrowsError(try ContractFixtures.decode(Worker.self, json))
    }

    func testChatWorkersLinksAndReceiptsDecode() throws {
        let worker = ContractFixtures.worker()
        let chatWorkers = try ContractFixtures.decode([ChatWorker].self, #"[{"anchorMessageId":"msg_1","worker":\#(worker)}]"#)
        XCTAssertEqual(chatWorkers.first?.anchorMessageID, "msg_1")
        let links = try ContractFixtures.decode([WorkerLink].self, #"[{"chatId":"chat_1","workerId":"wkr_1"}]"#)
        XCTAssertEqual(links.first?.workerID, "wkr_1")
        let followUp = try ContractFixtures.decode(WorkerFollowUpReceipt.self, #"{"messageId":"msg_2","worker":\#(worker)}"#)
        XCTAssertEqual(followUp.messageID, "msg_2")
        let stop = try ContractFixtures.decode(WorkerStopReceipt.self, #"{"worker":\#(worker)}"#)
        XCTAssertEqual(stop.worker.id, "wkr_1")
        XCTAssertThrowsError(try ContractFixtures.decode(WorkerStopReceipt.self, #"{"cancelRequested":true}"#))
    }

    func testAFollowUpSendsItsAnswerAndRefusesBlankText() throws {
        let input = try XCTUnwrap(WorkerFollowUpInput(
            serverID: "server_1", workerID: "wkr_1", text: "Use the token bucket.", nonce: "nonce_1", answersTurnID: "wkt_1"
        ))
        XCTAssertEqual(try ContractFixtures.encoded(input), try ContractFixtures.object(
            #"{"answersTurnId":"wkt_1","nonce":"nonce_1","serverId":"server_1","text":"Use the token bucket.","workerId":"wkr_1"}"#
        ))
        XCTAssertNil(WorkerFollowUpInput(serverID: "s", workerID: "w", text: "  \n", nonce: "n"))
        XCTAssertNil(WorkerFollowUpInput(serverID: "s", workerID: "w", text: "ok", nonce: ""))
    }

    func testTargetsAndLinkReadsSendTheirExactShapes() throws {
        XCTAssertEqual(try ContractFixtures.encoded(WorkerTarget(serverID: "server_1", workerID: "wkr_1")), try ContractFixtures.object(
            #"{"serverId":"server_1","workerId":"wkr_1"}"#
        ))
        XCTAssertEqual(try ContractFixtures.encoded(WorkerChatInput(serverID: "server_1", chatID: "chat_1")), try ContractFixtures.object(
            #"{"chatId":"chat_1","serverId":"server_1"}"#
        ))
        let links = try XCTUnwrap(WorkerLinksInput(serverID: "server_1", workerIDs: ["wkr_1"]))
        XCTAssertEqual(try ContractFixtures.encoded(links), try ContractFixtures.object(
            #"{"serverId":"server_1","workerIds":["wkr_1"]}"#
        ))
        XCTAssertNil(WorkerLinksInput(serverID: "s", workerIDs: (0...50).map { "wkr_\($0)" }))
    }

    func testThePullRequestReadingDecodesStrictly() throws {
        let reading = try ContractFixtures.decode(PullRequestReading.self, ContractFixtures.pullRequestReading)
        XCTAssertEqual(reading.source, .github)
        XCTAssertEqual(reading.headSha, "abc123")
        XCTAssertEqual(reading.review, "approved")
        let unknownState = ContractFixtures.pullRequestReading.replacingOccurrences(of: #""state":"open""#, with: #""state":"queued""#)
        XCTAssertThrowsError(try ContractFixtures.decode(PullRequestReading.self, unknownState))
        let noSource = ContractFixtures.pullRequestReading.replacingOccurrences(of: #""source":"github","#, with: "")
        XCTAssertThrowsError(try ContractFixtures.decode(PullRequestReading.self, noSource))
    }

    func testTheUpdatedStreamIsTheWorkersOwnAndOnlyLiveForTheSession() {
        XCTAssertEqual(RealtimeStream.cloudAgentWorkUpdated.path, "worker.onUpdated")
        XCTAssertTrue(RealtimeStream.cloudAgentWorkUpdated.joinsLiveSession)
    }
}
