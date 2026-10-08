import Foundation
import XCTest
@testable import HausTransport

/// A request that fails below tRPC keeps its `URLError` code, so a caller can
/// say "you're offline" for a phone without a route instead of blaming the
/// Server or a Computer.
final class TRPCTransportFailureTests: XCTestCase {
    func testANoNetworkFailureCarriesItsCodeAndReadsAsNoConnection() async throws {
        let error = try await failingQuery(.notConnectedToInternet)
        XCTAssertEqual(error.urlErrorCode, .notConnectedToInternet)
        XCTAssertTrue(error.isTransport)
        XCTAssertTrue(error.isNoConnection)
    }

    func testADroppedLinkReadsAsNoConnection() async throws {
        let error = try await failingQuery(.networkConnectionLost)
        XCTAssertTrue(error.isNoConnection)
    }

    func testATimeoutIsATransportFailureButNotNoConnection() async throws {
        let error = try await failingQuery(.timedOut)
        XCTAssertTrue(error.isTransport)
        XCTAssertFalse(error.isNoConnection, "A slow Server is not proof the phone is offline")
    }

    func testAFailureWithoutAURLErrorIsNotNoConnection() {
        XCTAssertFalse(TRPCClientError.transport("The server returned a non-HTTP response.").isNoConnection)
        XCTAssertFalse(TRPCClientError.decoding("bad").isTransport)
    }

    private func failingQuery(_ code: URLError.Code) async throws -> TRPCClientError {
        FailingURLProtocol.code = code
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [FailingURLProtocol.self]
        let client = TRPCClient(
            config: AppConfig(serverOrigin: URL(string: "https://haus.test")!, productVersion: "test"),
            sessionTokenProvider: StaticSessionTokenProvider(token: nil),
            session: URLSession(configuration: configuration)
        )
        do {
            let _: QueryOutput = try await client.query("agent.workspaceFile", input: QueryInput(serverID: "srv_1"))
            XCTFail("Expected a transport failure")
            throw CancellationError()
        } catch let error as TRPCClientError {
            return error
        }
    }
}

/// Fails every request with one `URLError`, as the system does offline.
private final class FailingURLProtocol: URLProtocol {
    nonisolated(unsafe) static var code: URLError.Code = .unknown

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() { client?.urlProtocol(self, didFailWithError: URLError(Self.code)) }
    override func stopLoading() {}
}

private extension TRPCClientError {
    var urlErrorCode: URLError.Code? {
        guard case let .transport(_, code) = self else { return nil }
        return code
    }
}
