import Foundation
import XCTest

// Fixtures shared by the tRPC client tests: a stubbed URL session and the
// payload shapes the requests and streams carry.

func makeStubSession() -> URLSession {
    let configuration = URLSessionConfiguration.ephemeral
    configuration.protocolClasses = [StubURLProtocol.self]
    return URLSession(configuration: configuration)
}

struct QueryInput: Codable, Equatable {
    let serverID: String
}

struct QueryOutput: Codable, Equatable {
    let count: Int
}

struct SubscriptionInput: Codable {
    let serverID: String
}

struct SubscriptionOutput: Codable, Equatable, Sendable {
    let kind: String
    let text: String
}

actor SubscriptionCallbackCount {
    private(set) var value = 0

    func increment() {
        value += 1
    }
}

final class StubURLProtocol: URLProtocol {
    typealias Handler = (URLRequest) throws -> StubResponse

    nonisolated(unsafe) static var requestHandler: Handler?

    override class func canInit(with request: URLRequest) -> Bool {
        true
    }

    override class func canonicalRequest(for request: URLRequest) -> URLRequest {
        request
    }

    override func startLoading() {
        do {
            let result = try XCTUnwrap(Self.requestHandler?(request))
            client?.urlProtocol(
                self,
                didReceive: result.response,
                cacheStoragePolicy: .notAllowed
            )
            client?.urlProtocol(self, didLoad: result.data)
            client?.urlProtocolDidFinishLoading(self)
        } catch {
            client?.urlProtocol(self, didFailWithError: error)
        }
    }

    override func stopLoading() {}
}

struct StubResponse {
    let response: HTTPURLResponse
    let data: Data
}

func response(
    status: Int = 200,
    headers: [String: String] = ["Content-Type": "application/json"],
    data: Data
) -> StubResponse {
    StubResponse(
        response: HTTPURLResponse(
            url: URL(string: "https://haus.test")!,
            statusCode: status,
            httpVersion: nil,
            headerFields: headers
        )!,
        data: data
    )
}

func readBody(_ stream: InputStream) -> Data {
    stream.open()
    defer { stream.close() }
    var data = Data()
    var buffer = [UInt8](repeating: 0, count: 4096)
    while stream.hasBytesAvailable {
        let count = stream.read(&buffer, maxLength: buffer.count)
        if count <= 0 {
            break
        }
        data.append(contentsOf: buffer[..<count])
    }
    return data
}
