import Foundation
import XCTest
@testable import HausModels

final class PushNotificationModelsTests: XCTestCase {
    // MARK: - Device token

    func testDeviceTokenIsLowercaseHexWithLeadingZeros() {
        let token = Data([0x00, 0x0f, 0xa0, 0xff, 0x7b])
        XCTAssertEqual(PushDeviceToken.hex(token), "000fa0ff7b")
    }

    func testThirtyTwoByteTokenIsSixtyFourCharacters() {
        let token = Data((0..<32).map { UInt8($0 * 7 & 0xff) })
        let hex = PushDeviceToken.hex(token)
        XCTAssertEqual(hex.count, 64)
        XCTAssertEqual(hex, hex.lowercased())
    }

    func testRegisterInputEncodesTheServerContract() throws {
        let input = RegisterPushDeviceInput(token: "ab01", environment: .sandbox, bundleId: "chat.haus.ios")
        let json = try JSONSerialization.jsonObject(with: JSONEncoder().encode(input)) as? [String: String]
        XCTAssertEqual(json, ["token": "ab01", "environment": "sandbox", "bundleId": "chat.haus.ios"])
    }

    // MARK: - Environment

    func testStoreDistributedBuildIsProduction() {
        XCTAssertEqual(PushEnvironment.resolve(signature: .storeDistributed, isSimulator: false), .production)
    }

    func testDevelopmentProfileIsSandbox() {
        XCTAssertEqual(
            PushEnvironment.resolve(signature: .provisioned(apsEnvironment: "development"), isSimulator: false),
            .sandbox
        )
    }

    func testAdHocProfileIsProduction() {
        XCTAssertEqual(
            PushEnvironment.resolve(signature: .provisioned(apsEnvironment: "production"), isSimulator: false),
            .production
        )
    }

    func testSimulatorIsAlwaysSandbox() {
        XCTAssertEqual(PushEnvironment.resolve(signature: .storeDistributed, isSimulator: true), .sandbox)
    }

    func testMissingProfileReadsAsStoreDistributed() {
        XCTAssertEqual(PushEnvironment.signature(embeddedProfile: nil), .storeDistributed)
    }

    func testReadsApsEnvironmentOutOfTheCMSEnvelope() {
        let profile = envelope(plist: profilePlist(aps: "production"))
        XCTAssertEqual(
            PushEnvironment.signature(embeddedProfile: profile),
            .provisioned(apsEnvironment: "production")
        )
    }

    func testProfileWithoutPushEntitlementHasNoApsEnvironment() {
        let profile = envelope(plist: profilePlist(aps: nil))
        XCTAssertEqual(PushEnvironment.signature(embeddedProfile: profile), .provisioned(apsEnvironment: nil))
        XCTAssertEqual(
            PushEnvironment.resolve(signature: .provisioned(apsEnvironment: nil), isSimulator: false),
            .sandbox
        )
    }

    // MARK: - Payload and route

    func testTopLevelPayloadRoutesToItsChat() throws {
        let payload = try XCTUnwrap(PushNotificationPayload(userInfo: userInfo(anchor: nil)))
        XCTAssertEqual(payload.serverID, "server_1")
        XCTAssertEqual(payload.messageID, "message_9")
        XCTAssertEqual(payload.route, .chat(chatID: "chat_dm"))
    }

    func testThreadPayloadRoutesToItsThread() throws {
        var info = userInfo(anchor: "message_anchor")
        info["chatId"] = "chat_thread"
        info["conversationChatId"] = "chat_channel"
        let payload = try XCTUnwrap(PushNotificationPayload(userInfo: info))
        XCTAssertEqual(
            payload.route,
            .thread(conversationChatID: "chat_channel", threadChatID: "chat_thread", anchorMessageID: "message_anchor")
        )
    }

    func testNullAnchorFromJSONIsTopLevel() throws {
        var info = userInfo(anchor: nil)
        info["threadAnchorMessageId"] = NSNull()
        XCTAssertEqual(PushNotificationPayload(userInfo: info)?.route, .chat(chatID: "chat_dm"))
    }

    func testMissingKeysParseToNothing() {
        var info = userInfo(anchor: nil)
        info["serverId"] = nil
        XCTAssertNil(PushNotificationPayload(userInfo: info))
        XCTAssertNil(PushNotificationPayload(userInfo: ["aps": ["alert": "hi"]]))
    }

    func testInconsistentThreadShapeParsesToNothing() {
        // An anchor on a top-level Chat, or a Thread Chat with no anchor.
        XCTAssertNil(PushNotificationPayload(userInfo: userInfo(anchor: "message_anchor")))
        var info = userInfo(anchor: nil)
        info["chatId"] = "chat_thread"
        XCTAssertNil(PushNotificationPayload(userInfo: info))
    }

    // MARK: - Foreground presentation

    func testSuppressesWhileViewingThatChat() {
        let payload = PushNotificationPayload(userInfo: userInfo(anchor: nil))
        XCTAssertEqual(
            PushForegroundPresentation.decide(payload, viewingServerID: "server_1", viewingChatID: "chat_dm"),
            .suppress
        )
    }

    func testBannersForAnotherChatServerOrNoChat() {
        let payload = PushNotificationPayload(userInfo: userInfo(anchor: nil))
        XCTAssertEqual(
            PushForegroundPresentation.decide(payload, viewingServerID: "server_1", viewingChatID: "chat_other"),
            .banner
        )
        XCTAssertEqual(
            PushForegroundPresentation.decide(payload, viewingServerID: "server_2", viewingChatID: "chat_dm"),
            .banner
        )
        XCTAssertEqual(
            PushForegroundPresentation.decide(payload, viewingServerID: "server_1", viewingChatID: nil),
            .banner
        )
        XCTAssertEqual(
            PushForegroundPresentation.decide(nil, viewingServerID: "server_1", viewingChatID: "chat_dm"),
            .banner
        )
    }

    func testThreadPushBannersOverItsParentChannel() {
        var info = userInfo(anchor: "message_anchor")
        info["chatId"] = "chat_thread"
        info["conversationChatId"] = "chat_channel"
        let payload = PushNotificationPayload(userInfo: info)
        XCTAssertEqual(
            PushForegroundPresentation.decide(payload, viewingServerID: "server_1", viewingChatID: "chat_channel"),
            .banner
        )
        XCTAssertEqual(
            PushForegroundPresentation.decide(payload, viewingServerID: "server_1", viewingChatID: "chat_thread"),
            .suppress
        )
    }

    // MARK: - Fixtures

    private func userInfo(anchor: String?) -> [AnyHashable: Any] {
        var info: [AnyHashable: Any] = [
            "aps": ["alert": ["title": "Blippy", "body": "Can you look?"], "sound": "default"],
            "serverId": "server_1",
            "chatId": "chat_dm",
            "conversationChatId": "chat_dm",
            "messageId": "message_9",
        ]
        if let anchor { info["threadAnchorMessageId"] = anchor }
        return info
    }

    private func profilePlist(aps: String?) -> Data {
        var entitlements: [String: Any] = ["application-identifier": "TEAM.chat.haus.ios"]
        if let aps { entitlements["aps-environment"] = aps }
        let root: [String: Any] = ["Name": "Haus", "Entitlements": entitlements]
        // swiftlint:disable:next force_try
        return try! PropertyListSerialization.data(fromPropertyList: root, format: .xml, options: 0)
    }

    /// Binary noise around the plist, as the signed CMS wrapper puts it.
    private func envelope(plist: Data) -> Data {
        Data([0x30, 0x82, 0x2a, 0x00, 0x06, 0x09]) + plist + Data([0xa0, 0x82, 0x03, 0x00])
    }
}
