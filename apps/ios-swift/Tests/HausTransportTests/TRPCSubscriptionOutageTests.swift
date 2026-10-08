import Foundation
import XCTest
@testable import HausTransport

final class TRPCSubscriptionOutageTests: XCTestCase {
    override func tearDown() {
        StubURLProtocol.requestHandler = nil
        super.tearDown()
    }

    /// A reconnecting stream never ends during an outage, so the transport
    /// reports each refused attempt and each dropped stream; the store's
    /// "Connecting…" header follows these calls.
    func testSubscriptionReportsEachFailedAttemptAndDroppedStream() async throws {
        let connected = SubscriptionCallbackCount()
        let disconnected = SubscriptionCallbackCount()
        nonisolated(unsafe) var requestCount = 0
        StubURLProtocol.requestHandler = { _ in
            requestCount += 1
            switch requestCount {
            case 1, 2:
                throw URLError(.cannotConnectToHost)
            case 3:
                // Connected, then dropped without tRPC's `return`.
                return response(headers: ["Content-Type": "text/event-stream"], data: Data())
            default:
                return response(
                    headers: ["Content-Type": "text/event-stream"],
                    data: Data("event: return\ndata:\n\n".utf8)
                )
            }
        }
        let client = TRPCClient(
            config: AppConfig(serverOrigin: URL(string: "https://haus.test")!, productVersion: "test"),
            sessionTokenProvider: StaticSessionTokenProvider(token: "token"),
            session: makeStubSession()
        )

        let stream: AsyncThrowingStream<SubscriptionOutput, Error> = client.subscribe(
            "chat.onEvent",
            input: SubscriptionInput(serverID: "srv_123"),
            options: TRPCSubscriptionOptions(
                initialRetryDelayNanoseconds: 1,
                maximumRetryDelayNanoseconds: 1
            ),
            onConnected: { await connected.increment() },
            onDisconnected: { await disconnected.increment() }
        )
        for try await _ in stream {}

        let connectedCount = await connected.value
        let disconnectedCount = await disconnected.value
        XCTAssertEqual(requestCount, 4)
        XCTAssertEqual(disconnectedCount, 3)
        XCTAssertEqual(connectedCount, 2)
    }
}
