import Foundation
import XCTest
@testable import HausModels

final class ChatHistoryRecoveryIntegrationTests: XCTestCase {
    func testRecoveryDiscardsPreRecoveryReadAndAcceptsDeferredRefresh() throws {
        var requests = ChatHistoryRequests()
        var recovery = AgentMessageRecoveryState()
        let serverID = "server"
        let chatID = "chat"

        let pageTicket = try XCTUnwrap(
            requests.begin(chatID: chatID, policy: .page)
        )
        let staleRead = recovery.beginRead(serverID: serverID, chatID: chatID)

        let event = AgentLifecycleEvent(
            agentID: "agent",
            chatID: chatID,
            emittedAt: Date(timeIntervalSince1970: 1),
            runID: "run",
            serverID: serverID,
            phase: .sending
        )
        XCTAssertNotNil(
            recovery.beginRecovery(
                event: event,
                activeServerID: serverID,
                mountedChatIDs: [chatID]
            )
        )
        XCTAssertFalse(recovery.accepts(staleRead, activeServerID: serverID))

        XCTAssertNil(requests.begin(chatID: chatID, policy: .refresh))
        XCTAssertEqual(requests.finish(pageTicket, chatID: chatID), true)

        let refreshTicket = try XCTUnwrap(
            requests.begin(chatID: chatID, policy: .refresh)
        )
        let freshRead = recovery.beginRead(serverID: serverID, chatID: chatID)

        XCTAssertTrue(requests.isCurrent(refreshTicket, chatID: chatID))
        XCTAssertTrue(recovery.accepts(freshRead, activeServerID: serverID))
        XCTAssertEqual(requests.finish(refreshTicket, chatID: chatID), false)
    }
}
