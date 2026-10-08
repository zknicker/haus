import Foundation
import XCTest
@testable import HausTransport

final class ProfileAvatarModelsTests: XCTestCase {
    func testHumanIdentitySyncEncodesNullableClerkFieldsAndServerID() throws {
        let input = SyncHumanIdentityInput(email: nil, name: nil, serverID: "srv_123")
        let object = try jsonObject(input)

        XCTAssertEqual(Set(object.keys), ["email", "name", "serverId"])
        XCTAssertTrue(object["email"] is NSNull)
        XCTAssertTrue(object["name"] is NSNull)
        XCTAssertEqual(object["serverId"] as? String, "srv_123")
    }

    /// `timezone` is optional, not nullable, on the Server: a device zone the
    /// phone skipped must be omitted, never sent as null.
    func testHumanIdentitySyncSendsTheDeviceZoneOnlyWhenPresent() throws {
        let withZone = try jsonObject(
            SyncHumanIdentityInput(email: nil, name: "Zach", serverID: "srv_123", timezone: "America/New_York")
        )
        XCTAssertEqual(withZone["timezone"] as? String, "America/New_York")

        let withoutZone = try jsonObject(SyncHumanIdentityInput(email: nil, name: "Zach", serverID: "srv_123"))
        XCTAssertNil(withoutZone["timezone"])
    }

    func testSetTimezoneInputUsesTheServerWireNames() throws {
        let object = try jsonObject(SetHumanTimezoneInput(serverID: "srv_123", timezone: "Asia/Tokyo"))
        XCTAssertEqual(Set(object.keys), ["serverId", "timezone"])
        XCTAssertEqual(object["timezone"] as? String, "Asia/Tokyo")
    }

    func testHumanProfileInputEncodesNullableDescriptionAndExactWireNames() throws {
        let input = UpdateHumanProfileInput(
            description: nil,
            displayName: "Zach Knickerbocker",
            handle: "zach",
            serverID: "srv_123"
        )
        let object = try jsonObject(input)

        XCTAssertEqual(Set(object.keys), ["description", "displayName", "handle", "serverId"])
        XCTAssertTrue(object["description"] is NSNull)
        XCTAssertEqual(object["displayName"] as? String, "Zach Knickerbocker")
        XCTAssertEqual(object["handle"] as? String, "zach")
        XCTAssertEqual(object["serverId"] as? String, "srv_123")
    }

    func testAgentProfileInputEncodesNullableDescriptionAndIDs() throws {
        let input = UpdateAgentProfileInput(
            agentID: "agent_cove",
            description: nil,
            displayName: "Cove",
            serverID: "srv_123"
        )
        let object = try jsonObject(input)

        XCTAssertEqual(Set(object.keys), ["agentId", "description", "displayName", "serverId"])
        XCTAssertEqual(object["agentId"] as? String, "agent_cove")
        XCTAssertTrue(object["description"] is NSNull)
        XCTAssertEqual(object["serverId"] as? String, "srv_123")
    }

    func testAvatarSetAndClearEncodeDiscriminatedTargets() throws {
        let set = SetAvatarInput(
            bytesBase64: "aGVsbG8=",
            mediaType: .png,
            serverID: "srv_123",
            target: .agent(agentID: "agent_1")
        )
        let setObject = try jsonObject(set)
        XCTAssertEqual(Set(setObject.keys), ["bytesBase64", "mediaType", "serverId", "target"])
        XCTAssertEqual(setObject["mediaType"] as? String, "image/png")
        XCTAssertEqual(
            setObject["target"] as? [String: String],
            ["agentId": "agent_1", "kind": "agent"]
        )

        let clear = ClearAvatarInput(serverID: "srv_123", target: .user)
        let clearObject = try jsonObject(clear)
        XCTAssertEqual(Set(clearObject.keys), ["serverId", "target"])
        XCTAssertEqual(clearObject["target"] as? [String: String], ["kind": "user"])
    }

    func testAvatarResponseDecodesSetAndClearShapes() throws {
        let set = try JSONDecoder().decode(
            Avatar.self,
            from: Data(#"{"avatarId":"avt_0123456789abcdef","avatarUrl":"/avatars/avt_0123456789abcdef"}"#.utf8)
        )
        XCTAssertEqual(set, Avatar(avatarID: "avt_0123456789abcdef", avatarURL: "/avatars/avt_0123456789abcdef"))

        let clear = try JSONDecoder().decode(Avatar.self, from: Data(#"{"avatarId":null,"avatarUrl":null}"#.utf8))
        XCTAssertEqual(clear, Avatar(avatarID: nil, avatarURL: nil))
    }

    func testAvatarGenerationUsesTheServerProcedureShape() throws {
        let input = GenerateAgentAvatarInput(
            agentID: "agent_cove",
            concept: "  a moonlit fox cartographer  ",
            serverID: "srv_123"
        )
        let object = try jsonObject(input)

        XCTAssertEqual(Set(object.keys), ["agentId", "concept", "serverId"])
        XCTAssertEqual(object["agentId"] as? String, "agent_cove")
        XCTAssertEqual(object["concept"] as? String, "  a moonlit fox cartographer  ")
        XCTAssertEqual(object["serverId"] as? String, "srv_123")

        let response = try JSONDecoder().decode(
            GenerateAgentAvatarResponse.self,
            from: Data(
                #"{"avatar":{"bytesBase64":"iVBORw0KGgo=","byteSize":8,"height":256,"mediaType":"image/png","width":256}}"#.utf8
            )
        )
        XCTAssertEqual(response.avatar.byteSize, 8)
        XCTAssertEqual(response.avatar.height, 256)
        XCTAssertEqual(response.avatar.mediaType, .png)
        XCTAssertEqual(response.avatar.width, 256)
    }

    private func jsonObject<Value: Encodable>(_ value: Value) throws -> [String: Any] {
        let data = try JSONEncoder().encode(value)
        return try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
    }
}
