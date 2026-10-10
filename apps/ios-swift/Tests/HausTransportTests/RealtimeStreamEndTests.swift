import Foundation
import HausModels
import XCTest
@testable import HausTransport

/// How a subscription's end maps onto the refusal classes
/// (specs/realtime-events.md, "Refusal classes").
final class RealtimeStreamEndTests: XCTestCase {
    override func tearDown() {
        StubURLProtocol.requestHandler = nil
        super.tearDown()
    }

    func testACompletedStreamIsNotARefusal() {
        XCTAssertEqual(RealtimeStreamEnd(error: nil), .completed)
    }

    func testCodedRefusalsAreReadFromTheErrorData() {
        XCTAssertEqual(RealtimeStreamEnd(error: refusal("membership_lost")), .refused(.membershipLost))
        XCTAssertEqual(RealtimeStreamEnd(error: refusal("role_required")), .refused(.roleRequired))
    }

    /// A per-Chat stream for a Chat deleted while the iPhone was away is
    /// refused `NOT_FOUND` + `chat_missing`: it purges the Chat and stops,
    /// where an uncoded `NOT_FOUND` still restarts.
    func testChatMissingStopsAPerChatStream() {
        let missing = RealtimeStreamEnd(error: TRPCError(
            message: "Chat not found",
            data: .object(["code": .string("NOT_FOUND"), "hausRefusal": .string("chat_missing")])
        ))
        XCTAssertEqual(missing, .refused(.chatMissing))
        XCTAssertEqual(missing.chatStreamDecision, .chatMissing)

        let uncoded = RealtimeStreamEnd(error: TRPCError(
            message: "Not found", data: .object(["code": .string("NOT_FOUND")])
        ))
        XCTAssertEqual(uncoded.chatStreamDecision, .restart)
        XCTAssertEqual(RealtimeStreamEnd(error: nil).chatStreamDecision, .restart)
        XCTAssertEqual(RealtimeStreamEnd(error: refusal("membership_lost")).chatStreamDecision, .restart)
    }

    func testForbiddenOrNotFoundWithoutARefusalOnlyRestarts() {
        XCTAssertEqual(RealtimeStreamEnd(error: TRPCError(
            message: "Forbidden", data: .object(["code": .string("FORBIDDEN")])
        )), .failed)
        XCTAssertEqual(RealtimeStreamEnd(error: TRPCError(
            message: "Not found", data: .object(["code": .string("NOT_FOUND")])
        )), .failed)
        XCTAssertEqual(RealtimeStreamEnd(error: refusal("future_refusal")), .failed)
        XCTAssertEqual(RealtimeStreamEnd(error: TRPCClientError.decoding("bad frame")), .failed)
    }

    func testAnExpiredSessionIsUnauthorized() {
        XCTAssertEqual(RealtimeStreamEnd(error: TRPCError(
            message: "Unauthorized", data: .object(["code": .string("UNAUTHORIZED")])
        )), .unauthorized)
        XCTAssertEqual(RealtimeStreamEnd(error: TRPCError(message: "Unauthorized", httpStatus: 401)), .unauthorized)
    }

    /// The Server ends a live stream with a serialized error frame carrying
    /// `hausRefusal`; the stream throws it, and the class survives.
    func testAServerRefusalFrameEndsTheStreamWithItsClass() async throws {
        StubURLProtocol.requestHandler = { _ in
            let body = """
            event: serialized-error
            data: {"message":"Not a member","code":-32003,"data":{"code":"FORBIDDEN","hausRefusal":"membership_lost"}}

            """
            return response(headers: ["Content-Type": "text/event-stream"], data: Data(body.utf8))
        }
        let client = TRPCClient(
            config: AppConfig(serverOrigin: URL(string: "https://haus.test")!, productVersion: "test"),
            sessionTokenProvider: StaticSessionTokenProvider(token: "token"),
            session: makeStubSession(),
            streamSession: makeStubSession()
        )
        let stream: AsyncThrowingStream<SubscriptionOutput, Error> = client.subscribe(
            "server.onUpdated",
            input: SubscriptionInput(serverID: "srv_123")
        )

        var ended: Error?
        do {
            for try await _ in stream {}
        } catch {
            ended = error
        }

        XCTAssertEqual(RealtimeStreamEnd(error: ended), .refused(.membershipLost))
    }

    func testAnUnauthorizedSubscribeIsNotRetriedByTheTransport() async throws {
        nonisolated(unsafe) var requestCount = 0
        StubURLProtocol.requestHandler = { _ in
            requestCount += 1
            return response(
                status: 401,
                data: Data(#"{"error":{"message":"Unauthorized","code":-32001,"data":{"code":"UNAUTHORIZED","httpStatus":401}}}"#.utf8)
            )
        }
        let client = TRPCClient(
            config: AppConfig(serverOrigin: URL(string: "https://haus.test")!, productVersion: "test"),
            sessionTokenProvider: StaticSessionTokenProvider(token: "token"),
            session: makeStubSession(),
            streamSession: makeStubSession()
        )
        let stream: AsyncThrowingStream<SubscriptionOutput, Error> = client.subscribe(
            "chat.onMessageCreated",
            input: SubscriptionInput(serverID: "srv_123")
        )

        var ended: Error?
        do {
            for try await _ in stream {}
        } catch {
            ended = error
        }

        XCTAssertEqual(requestCount, 1, "the Store reauthenticates; the transport does not loop")
        XCTAssertEqual(RealtimeStreamEnd(error: ended), .unauthorized)
    }

    private func refusal(_ value: String) -> TRPCError {
        TRPCError(
            message: "Refused",
            data: .object(["code": .string("FORBIDDEN"), "hausRefusal": .string(value)])
        )
    }
}
