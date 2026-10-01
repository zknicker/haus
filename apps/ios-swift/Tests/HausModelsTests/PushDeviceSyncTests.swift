import Foundation
import XCTest
@testable import HausModels

final class PushDeviceSyncTests: XCTestCase {
    // MARK: - Register / unregister

    func testOnRegistersANewTokenOnce() {
        XCTAssertEqual(action(isOn: true, pending: false, token: "a", registered: nil), .register)
        XCTAssertEqual(action(isOn: true, pending: false, token: "a", registered: "a"), .none)
        XCTAssertEqual(action(isOn: true, pending: false, token: "b", registered: "a"), .register)
    }

    func testOffUnregistersOnlyWhilePending() {
        XCTAssertEqual(action(isOn: false, pending: true, token: "a", registered: nil), .unregister)
        XCTAssertEqual(action(isOn: false, pending: false, token: "a", registered: nil), .none)
    }

    func testNothingHappensWithoutAToken() {
        XCTAssertEqual(action(isOn: true, pending: false, token: nil, registered: nil), .none)
        XCTAssertEqual(action(isOn: false, pending: true, token: nil, registered: nil), .none)
    }

    func testSignOutUnregistersOnlyATokenThisAccountRegistered() {
        XCTAssertEqual(signOutToken(token: "a", isOn: true, pending: false), "a")
        XCTAssertEqual(signOutToken(token: "a", isOn: false, pending: true), "a")
        XCTAssertNil(signOutToken(token: "a", isOn: false, pending: false))
        XCTAssertNil(signOutToken(token: nil, isOn: true, pending: true))
    }

    func testAPendingUnregisterStillAsksForTheToken() {
        XCTAssertTrue(PushDeviceSync.needsToken(isOn: false, pendingUnregister: true))
        XCTAssertTrue(PushDeviceSync.needsToken(isOn: true, pendingUnregister: false))
        XCTAssertFalse(PushDeviceSync.needsToken(isOn: false, pendingUnregister: false))
    }

    func testPendingUnregisterPersistsUntilCleared() throws {
        let suite = "PushDeviceSyncTests.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }

        XCTAssertFalse(PendingPushUnregister(defaults: defaults).isPending)
        PendingPushUnregister(defaults: defaults).isPending = true
        // A later launch reads the same flag and retries.
        XCTAssertTrue(PendingPushUnregister(defaults: defaults).isPending)
        PendingPushUnregister(defaults: defaults).isPending = false
        XCTAssertFalse(PendingPushUnregister(defaults: defaults).isPending)
    }

    // MARK: - Delivered cleanup

    func testOpeningAConversationClearsItsGroupAndThreads() {
        let delivered = [
            delivered("1", conversation: "chan", chat: "chan"),
            delivered("2", conversation: "chan", chat: "thread"),
            delivered("3", conversation: "dm", chat: "dm"),
        ]
        XCTAssertEqual(DeliveredPushCleanup.identifiers(delivered, openedChatID: "chan"), ["1", "2"])
        XCTAssertEqual(DeliveredPushCleanup.identifiers(delivered, openedChatID: "thread"), ["2"])
        XCTAssertEqual(DeliveredPushCleanup.identifiers(delivered, openedChatID: "other"), [])
        XCTAssertEqual(DeliveredPushCleanup.identifiers(delivered, openedChatID: nil), [])
    }

    private func action(isOn: Bool, pending: Bool, token: String?, registered: String?) -> PushDeviceSync.Action {
        PushDeviceSync.action(isOn: isOn, pendingUnregister: pending, token: token, registeredToken: registered)
    }

    private func delivered(_ id: String, conversation: String, chat: String) -> DeliveredPushCleanup.Delivered {
        DeliveredPushCleanup.Delivered(
            identifier: id,
            threadID: conversation,
            payload: PushNotificationPayload(
                serverID: "srv",
                chatID: chat,
                conversationChatID: conversation,
                threadAnchorMessageID: chat == conversation ? nil : "anchor",
                messageID: "msg-\(id)"
            )
        )
    }

    private func signOutToken(token: String?, isOn: Bool, pending: Bool) -> String? {
        PushDeviceSync.signOutUnregisterToken(token: token, isOn: isOn, pendingUnregister: pending)
    }
}
