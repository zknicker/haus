import Foundation
import HausModels
import XCTest
@testable import HausTransport

/// SSE control frames (`connected`, `ping`, `return`, comments) never surface as values.
final class TRPCSubscriptionFrameTests: XCTestCase {
    override func tearDown() {
        StubURLProtocol.requestHandler = nil
        super.tearDown()
    }

    func testSubscriptionReadsTRPC11SSEDataAndIgnoresControlEvents() async throws {
        StubURLProtocol.requestHandler = { request in
            XCTAssertEqual(request.httpMethod, "GET")
            XCTAssertEqual(request.url?.path, "/trpc/chat.onMessageCreated")
            XCTAssertNotNil(request.url?.query?.range(of: "input="))
            XCTAssertEqual(request.value(forHTTPHeaderField: "accept"), "text/event-stream")
            let body = """
            event: connected
            data: {}

            : heartbeat

            id: 7
            data: {"kind":"message","text":"hello"}

            event: ping
            data:

            event: return
            data:

            """
            return response(
                headers: ["Content-Type": "text/event-stream"],
                data: Data(body.utf8)
            )
        }
        let client = TRPCClient(
            config: AppConfig(serverOrigin: URL(string: "https://haus.test")!, productVersion: "test"),
            sessionTokenProvider: StaticSessionTokenProvider(token: "token"),
            session: makeStubSession(),
            streamSession: makeStubSession()
        )

        var values: [SubscriptionOutput] = []
        let stream: AsyncThrowingStream<SubscriptionOutput, Error> = client.subscribe(
            "chat.onMessageCreated",
            input: SubscriptionInput(serverID: "srv_123"),
            options: TRPCSubscriptionOptions(reconnect: false)
        )
        for try await value in stream {
            values.append(value)
        }

        XCTAssertEqual(values, [SubscriptionOutput(kind: "message", text: "hello")])
    }

    /// The Server's keepalive (tRPC `sse.ping`) interleaves `ping` frames with
    /// data on every stream; they must never surface as values or decode errors.
    func testSubscriptionIgnoresServerKeepalivePingsBetweenDataFrames() async throws {
        StubURLProtocol.requestHandler = { _ in
            let body = """
            event: connected
            data: {"reconnectAfterInactivityMs":45000}

            event: ping
            data:

            event: ping
            data:

            id: 1
            data: {"kind":"message","text":"one"}

            event: ping
            data:

            id: 2
            data: {"kind":"message","text":"two"}

            event: ping
            data:

            event: return
            data:

            """
            return response(
                headers: ["Content-Type": "text/event-stream"],
                data: Data(body.utf8)
            )
        }
        let client = TRPCClient(
            config: AppConfig(serverOrigin: URL(string: "https://haus.test")!, productVersion: "test"),
            sessionTokenProvider: StaticSessionTokenProvider(token: "token"),
            session: makeStubSession(),
            streamSession: makeStubSession()
        )

        var values: [SubscriptionOutput] = []
        let stream: AsyncThrowingStream<SubscriptionOutput, Error> = client.subscribe(
            "chat.onMessageCreated",
            input: SubscriptionInput(serverID: "srv_123"),
            options: TRPCSubscriptionOptions(reconnect: false)
        )
        for try await value in stream {
            values.append(value)
        }

        XCTAssertEqual(
            values,
            [
                SubscriptionOutput(kind: "message", text: "one"),
                SubscriptionOutput(kind: "message", text: "two"),
            ]
        )
    }
}
