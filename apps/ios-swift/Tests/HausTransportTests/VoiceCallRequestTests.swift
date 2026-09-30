import Foundation
import XCTest
import HausModels
@testable import HausTransport

final class VoiceCallRequestTests: XCTestCase {
    func testVoiceRequestUsesSecureSocketAndCurrentAuthentication() async throws {
        let client = TRPCClient(
            config: AppConfig(serverOrigin: URL(string: "https://haus.test")!, productVersion: "test"),
            sessionTokenProvider: StaticSessionTokenProvider(token: "clerk_voice")
        )
        let request = try await client.voiceCallRequest(serverID: "srv_voice", chatID: "cht_voice")
        XCTAssertEqual(request.url?.scheme, "wss")
        XCTAssertEqual(request.url?.path, "/voice/call")
        let parameters = URLComponents(url: try XCTUnwrap(request.url), resolvingAgainstBaseURL: false)?.queryItems
        XCTAssertEqual(parameters?.first(where: { $0.name == "serverId" })?.value, "srv_voice")
        XCTAssertEqual(parameters?.first(where: { $0.name == "chatId" })?.value, "cht_voice")
        XCTAssertEqual(request.value(forHTTPHeaderField: "authorization"), "Bearer clerk_voice")
        XCTAssertEqual(request.value(forHTTPHeaderField: "x-haus-product-version"), "test")
        XCTAssertEqual(request.value(forHTTPHeaderField: "x-haus-app-protocol-version"), "7")
    }
}
