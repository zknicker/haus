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
        let payload = try XCTUnwrap(PushNotificationPayload(userInfo: userInfo()))
        XCTAssertEqual(payload.serverID, "server_1")
        XCTAssertEqual(payload.messageID, "message_9")
        XCTAssertEqual(payload.route, .chat(chatID: "chat_dm"))
    }

    func testMissingKeysParseToNothing() {
        var info = userInfo()
        info["serverId"] = nil
        XCTAssertNil(PushNotificationPayload(userInfo: info))
        XCTAssertNil(PushNotificationPayload(userInfo: ["aps": ["alert": "hi"]]))
    }

    func testAPushNamingASideConversationOpensItsParentChannel() throws {
        var info = userInfo()
        info["chatId"] = "chat_side"
        info["conversationChatId"] = "chat_channel"
        info["futureField"] = "x"
        let payload = try XCTUnwrap(PushNotificationPayload(userInfo: info))
        XCTAssertEqual(payload.route, .chat(chatID: "chat_channel"))
        XCTAssertEqual(payload.chatID, "chat_channel")
        XCTAssertEqual(
            PushForegroundPresentation.decide(payload, viewingServerID: "server_1", viewingChatID: "chat_channel"),
            .suppress
        )
    }

    func testRouteOpeningRule() {
        XCTAssertEqual(
            PushNotificationRoute.opening(chatID: "chat_dm", conversationChatID: "chat_dm", taskID: nil),
            .chat(chatID: "chat_dm")
        )
        XCTAssertEqual(
            PushNotificationRoute.opening(chatID: "chat_side", conversationChatID: "chat_channel", taskID: nil),
            .chat(chatID: "chat_channel")
        )
        XCTAssertEqual(
            PushNotificationRoute.opening(chatID: "chat_task_12", conversationChatID: "chat_channel", taskID: "task_12"),
            .task(taskID: "task_12", chatID: "chat_task_12")
        )
    }

    func testATaskPayloadRoutesToItsTaskWhateverElseItCarries() throws {
        var info = userInfo()
        info["chatId"] = "chat_task_12"
        info["conversationChatId"] = "chat_task_12"
        info["taskId"] = "task_12"
        info["taskShortId"] = "k3mq7xta"
        info["reason"] = "subscribed"
        info["conversation"] = ["kind": "channel", "name": "security"]
        info["futureField"] = ["nested": true]
        let payload = try XCTUnwrap(PushNotificationPayload(userInfo: info))
        XCTAssertEqual(payload.taskID, "task_12")
        XCTAssertEqual(payload.taskShortID, "k3mq7xta")
        XCTAssertEqual(payload.route, .task(taskID: "task_12", chatID: "chat_task_12"))
    }

    func testATaskPayloadNeedsNoConversationShape() throws {
        var info = userInfo()
        info["chatId"] = "chat_task_12"
        info["conversationChatId"] = nil
        info["taskId"] = "task_12"
        let payload = try XCTUnwrap(PushNotificationPayload(userInfo: info))
        XCTAssertNil(payload.taskShortID)
        XCTAssertEqual(payload.route, .task(taskID: "task_12", chatID: "chat_task_12"))
    }

    func testAPayloadWithoutATaskKeepsItsConversationRoute() throws {
        var info = userInfo()
        info["taskId"] = ""
        info["futureField"] = 42
        XCTAssertEqual(PushNotificationPayload(userInfo: info)?.route, .chat(chatID: "chat_dm"))
    }

    func testAPayloadWithoutAConversationIDOpensItsChat() {
        var info = userInfo()
        info["conversationChatId"] = nil
        XCTAssertEqual(PushNotificationPayload(userInfo: info)?.route, .chat(chatID: "chat_dm"))
    }

    func testAnIssuePushIsNoMessage() {
        XCTAssertNil(PushNotificationPayload(userInfo: [
            "kind": "issue_assignment", "serverId": "server_1", "issueId": "iss_1", "code": "GEN-12",
        ]))
    }

    func testACaptainChatPayloadSaysItsKind() throws {
        var info = userInfo()
        info["conversation"] = ["kind": "captain", "name": "Forge"]
        XCTAssertEqual(try XCTUnwrap(PushNotificationPayload(userInfo: info)).conversationKind, .captain)
    }

    func testATaskPushSuppressesOnlyWhileItsTaskChatIsOnScreen() {
        var info = userInfo()
        info["chatId"] = "chat_task_12"
        info["conversationChatId"] = "chat_task_12"
        info["taskId"] = "task_12"
        let payload = PushNotificationPayload(userInfo: info)
        XCTAssertEqual(
            PushForegroundPresentation.decide(payload, viewingServerID: "server_1", viewingChatID: "chat_task_12"),
            .suppress
        )
        XCTAssertEqual(
            PushForegroundPresentation.decide(payload, viewingServerID: "server_1", viewingChatID: "chat_security"),
            .banner
        )
    }

    // MARK: - Foreground presentation

    func testSuppressesWhileViewingThatChat() {
        let payload = PushNotificationPayload(userInfo: userInfo())
        XCTAssertEqual(
            PushForegroundPresentation.decide(payload, viewingServerID: "server_1", viewingChatID: "chat_dm"),
            .suppress
        )
    }

    func testBannersForAnotherChatServerOrNoChat() {
        let payload = PushNotificationPayload(userInfo: userInfo())
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

    // MARK: - Fixtures

    private func userInfo() -> [AnyHashable: Any] {
        [
            "aps": ["alert": ["title": "Blippy", "body": "Can you look?"], "sound": "default"],
            "serverId": "server_1",
            "chatId": "chat_dm",
            "conversationChatId": "chat_dm",
            "messageId": "message_9",
        ]
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
