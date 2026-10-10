import Foundation
import HausModels
import XCTest
@testable import HausTransport

/// Queries must never queue behind held SSE streams. Over HTTP/1.1 every
/// stream holds its own connection, and the stock six-per-host pool once gave
/// all six to streams, so every query timed out.
final class TRPCSessionsTests: XCTestCase {
    /// Server-wide streams plus one open Chat's engagement and thought streams.
    private let heldStreamCount = RealtimeStream.allCases.count + 2

    func testClientDefaultsToSeparateRequestAndStreamSessions() {
        let client = TRPCClient(
            config: AppConfig(serverOrigin: URL(string: "https://haus.test")!, productVersion: "test"),
            sessionTokenProvider: StaticSessionTokenProvider(token: nil)
        )

        XCTAssertTrue(client.session === TRPCSessions.requests)
        XCTAssertTrue(client.streamSession === TRPCSessions.streams)
        XCTAssertFalse(TRPCSessions.requests === TRPCSessions.streams)
    }

    func testStreamSessionHoldsEveryStreamWithHeadroomAndNoMinuteTimeout() {
        let streams = TRPCSessions.streams.configuration
        let requests = TRPCSessions.requests.configuration
        let stock = URLSessionConfiguration.default

        XCTAssertGreaterThan(streams.httpMaximumConnectionsPerHost, heldStreamCount)
        XCTAssertEqual(streams.httpMaximumConnectionsPerHost, TRPCSessions.streamConnectionsPerHost)
        XCTAssertGreaterThan(streams.timeoutIntervalForRequest, 60)
        XCTAssertEqual(requests.httpMaximumConnectionsPerHost, stock.httpMaximumConnectionsPerHost)
        XCTAssertEqual(requests.timeoutIntervalForRequest, stock.timeoutIntervalForRequest)
    }

    func testQueryCompletesWhileMoreStreamsThanTheStockPoolAreHeld() async throws {
        let server = try LoopbackHTTPServer()
        let origin = try await server.start()
        defer { server.stop() }
        let requestConfiguration = TRPCSessions.makeRequestConfiguration()
        requestConfiguration.timeoutIntervalForRequest = 5
        let client = TRPCClient(
            config: AppConfig(serverOrigin: origin, productVersion: "test"),
            sessionTokenProvider: StaticSessionTokenProvider(token: nil),
            session: URLSession(configuration: requestConfiguration),
            streamSession: URLSession(configuration: TRPCSessions.makeStreamConfiguration())
        )

        let connected = SubscriptionCallbackCount()
        let streams = holdStreams(on: client, connected: connected)
        defer { withExtendedLifetime(streams) {} }
        try await waitUntil(connected, reaches: heldStreamCount)

        let output: QueryOutput = try await client.query("probe.read")
        XCTAssertEqual(output, QueryOutput(count: 1))
    }

    /// Control: one stock session for both shows the starvation the split fixes,
    /// so the test above would fail if streams and queries shared a pool.
    func testSharedStockSessionStarvesQueriesBehindHeldStreams() async throws {
        let server = try LoopbackHTTPServer()
        let origin = try await server.start()
        defer { server.stop() }
        let shared = URLSession(configuration: .default)
        let client = TRPCClient(
            config: AppConfig(serverOrigin: origin, productVersion: "test"),
            sessionTokenProvider: StaticSessionTokenProvider(token: nil),
            session: shared,
            streamSession: shared
        )
        let stockLimit = shared.configuration.httpMaximumConnectionsPerHost
        XCTAssertLessThan(stockLimit, heldStreamCount)

        let connected = SubscriptionCallbackCount()
        let streams = holdStreams(on: client, connected: connected)
        defer { withExtendedLifetime(streams) {} }
        try await waitUntil(connected, reaches: stockLimit)

        let answered = await withTaskGroup(of: Bool.self) { group in
            group.addTask {
                let _: QueryOutput? = try? await client.query("probe.read")
                return true
            }
            group.addTask {
                try? await Task.sleep(for: .seconds(2))
                return false
            }
            let first = await group.next() ?? false
            group.cancelAll()
            return first
        }
        XCTAssertFalse(answered, "the query should queue behind the held streams")
    }

    private func holdStreams(
        on client: TRPCClient,
        connected: SubscriptionCallbackCount
    ) -> [AsyncThrowingStream<SubscriptionOutput, Error>] {
        (0..<heldStreamCount).map { index in
            client.subscribe(
                "stream.held\(index)",
                options: TRPCSubscriptionOptions(reconnect: false),
                onConnected: { await connected.increment() }
            )
        }
    }

    private func waitUntil(_ count: SubscriptionCallbackCount, reaches target: Int) async throws {
        let deadline = Date().addingTimeInterval(10)
        while await count.value < target {
            guard Date() < deadline else {
                let reached = await count.value
                XCTFail("only \(reached) of \(target) streams connected")
                return
            }
            try await Task.sleep(for: .milliseconds(20))
        }
    }
}
