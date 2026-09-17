import Foundation
import XCTest
@testable import HausModels

final class OptimisticMessageRowTests: XCTestCase {
    func testRowIsKeyedByItsNonceUntilServerNamesTheMessage() {
        XCTAssertEqual(
            OptimisticMessageRow.id(nonce: "n-1", serverMessageID: nil),
            "pending:n-1"
        )
    }

    func testRowAdoptsTheCanonicalIDSoTheDurableRowKeepsItsIdentity() {
        let sent = OptimisticMessageRow.id(nonce: "n-1", serverMessageID: "message-1")
        let durable = message(id: "message-1", nonce: "n-1")

        XCTAssertEqual(sent, durable.id)
    }

    func testAPageThatCarriesTheNonceSupersedesTheOptimisticRow() {
        let durableNonces = OptimisticMessageRow.durableNonces(in: [
            message(id: "message-1", nonce: "n-1"),
        ])

        XCTAssertTrue(
            OptimisticMessageRow.isSuperseded(nonce: "n-1", durableNonces: durableNonces)
        )
        XCTAssertFalse(
            OptimisticMessageRow.isSuperseded(nonce: "n-2", durableNonces: durableNonces)
        )
    }

    /// The receipt lands before the page that carries the message, so a row can
    /// already hold the canonical id while still being the only row on screen.
    func testAnAdoptedRowSurvivesUntilItsPageArrives() {
        let empty = OptimisticMessageRow.durableNonces(in: [])
        XCTAssertFalse(OptimisticMessageRow.isSuperseded(nonce: "n-1", durableNonces: empty))

        let arrived = OptimisticMessageRow.durableNonces(in: [message(id: "message-1", nonce: "n-1")])
        XCTAssertTrue(OptimisticMessageRow.isSuperseded(nonce: "n-1", durableNonces: arrived))
    }

    func testServerMessageIDsNeverCollideWithTheLocalKeySpace() {
        XCTAssertFalse(
            message(id: "message-1", nonce: "n-1").id.hasPrefix(OptimisticMessageRow.localIDPrefix)
        )
    }

    private func message(id: String, nonce: String) -> ChatMessage {
        ChatMessage(
            attachments: [],
            author: .human(profile: nil, userID: "user-1"),
            body: .text,
            cause: nil,
            chatID: "chat-1",
            content: "hello",
            createdAt: Date(timeIntervalSince1970: 0),
            id: id,
            nonce: nonce,
            reply: nil,
            runID: nil,
            sequence: 1,
            serverID: "server-1",
            sessionGeneration: nil,
            task: nil
        )
    }
}
