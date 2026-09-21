import Foundation
import XCTest
import HausModels
@testable import HausTransport

final class TRPCClientTests: XCTestCase {
    override func tearDown() {
        StubURLProtocol.requestHandler = nil
        super.tearDown()
    }

    func testQueryUsesSinglePostAndAppHeaders() async throws {
        let session = makeStubSession()
        let expectedInput = QueryInput(serverID: "srv_123")
        StubURLProtocol.requestHandler = { request in
            XCTAssertEqual(request.httpMethod, "POST")
            XCTAssertEqual(request.url?.path, "/trpc/server.list")
            XCTAssertEqual(request.value(forHTTPHeaderField: "content-type"), "application/json")
            XCTAssertEqual(request.value(forHTTPHeaderField: "x-haus-product-version"), "1.2.3")
            XCTAssertEqual(request.value(forHTTPHeaderField: "x-haus-app-protocol-version"), "7")
            XCTAssertEqual(request.value(forHTTPHeaderField: "authorization"), "Bearer clerk_123")
            let body = try XCTUnwrap(request.httpBody ?? request.httpBodyStream.flatMap(readBody))
            XCTAssertEqual(
                try JSONDecoder().decode(QueryInput.self, from: body),
                expectedInput
            )
            return response(data: Data(#"{"result":{"data":{"count":2}}}"#.utf8))
        }

        let client = TRPCClient(
            config: AppConfig(
                serverOrigin: URL(string: "https://haus.test")!,
                productVersion: "1.2.3"
            ),
            sessionTokenProvider: StaticSessionTokenProvider(token: "clerk_123"),
            session: session
        )
        let result: QueryOutput = try await client.query("server.list", input: expectedInput)

        XCTAssertEqual(result.count, 2)
    }

    func testMutationDecodesServerErrorEnvelope() async throws {
        StubURLProtocol.requestHandler = { _ in
            response(
                status: 401,
                data: Data(
                    #"{"error":{"message":"Sign in required","code":-32001,"data":{"code":"UNAUTHORIZED","path":"chat.send"}}}"#.utf8
                )
            )
        }
        let client = TRPCClient(
            config: AppConfig(serverOrigin: URL(string: "https://haus.test")!, productVersion: "test"),
            sessionTokenProvider: StaticSessionTokenProvider(token: nil),
            session: makeStubSession()
        )

        do {
            let _: QueryOutput = try await client.mutation("chat.send")
            XCTFail("Expected a typed tRPC error")
        } catch let error as TRPCError {
            XCTAssertEqual(error.message, "Sign in required")
            XCTAssertEqual(error.code, -32001)
            XCTAssertEqual(error.httpStatus, 401)
            XCTAssertEqual(error.path, "chat.send")
            XCTAssertEqual(error.domainCode, "UNAUTHORIZED")
        }
    }

    func testMutationAppliesTheOperationTimeoutItIsGiven() async throws {
        var seenTimeouts: [TimeInterval] = []
        StubURLProtocol.requestHandler = { request in
            seenTimeouts.append(request.timeoutInterval)
            return response(data: Data(#"{"result":{"data":{"count":1}}}"#.utf8))
        }
        let client = TRPCClient(
            config: AppConfig(serverOrigin: URL(string: "https://haus.test")!, productVersion: "test"),
            sessionTokenProvider: StaticSessionTokenProvider(token: "token"),
            session: makeStubSession()
        )

        let _: QueryOutput = try await client.mutation(
            "avatar.generate",
            input: QueryInput(serverID: "srv_123"),
            timeout: 180
        )
        let _: QueryOutput = try await client.mutation(
            "avatar.set",
            input: QueryInput(serverID: "srv_123")
        )

        XCTAssertEqual(seenTimeouts.first, 180)
        XCTAssertEqual(seenTimeouts.last, 60)
    }

    func testMutationSupportsSuccessfulUndefinedResult() async throws {
        StubURLProtocol.requestHandler = { request in
            XCTAssertEqual(request.url?.path, "/trpc/member.updateProfile")
            return response(data: Data(#"{"result":{}}"#.utf8))
        }
        let client = TRPCClient(
            config: AppConfig(serverOrigin: URL(string: "https://haus.test")!, productVersion: "test"),
            sessionTokenProvider: StaticSessionTokenProvider(token: "token"),
            session: makeStubSession()
        )

        let _: TRPCNoContent = try await client.mutation(
            "member.updateProfile",
            input: UpdateHumanProfileInput(
                description: nil,
                displayName: "Zach",
                handle: "zach",
                serverID: "srv_123"
            )
        )
    }

    func testAttachmentUploadUsesRawPutAndAppHeaders() async throws {
        let fileURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("haus-upload-\(UUID().uuidString).txt")
        let bytes = Data("attachment bytes".utf8)
        try bytes.write(to: fileURL)
        defer { try? FileManager.default.removeItem(at: fileURL) }

        StubURLProtocol.requestHandler = { request in
            XCTAssertEqual(request.httpMethod, "PUT")
            XCTAssertEqual(request.url?.path, "/attachments/srv_123/att_123")
            XCTAssertEqual(request.value(forHTTPHeaderField: "content-type"), "application/octet-stream")
            XCTAssertEqual(request.value(forHTTPHeaderField: "accept"), "application/json")
            XCTAssertEqual(request.value(forHTTPHeaderField: "content-length"), String(bytes.count))
            XCTAssertEqual(request.value(forHTTPHeaderField: "x-haus-product-version"), "1.2.3")
            XCTAssertEqual(request.value(forHTTPHeaderField: "x-haus-app-protocol-version"), "7")
            XCTAssertEqual(request.value(forHTTPHeaderField: "authorization"), "Bearer clerk_123")
            let body = try XCTUnwrap(request.httpBody ?? request.httpBodyStream.flatMap(readBody))
            XCTAssertEqual(body, bytes)
            return response(
                data: Data(
                    #"{"attachment":{"filename":"notes.txt","id":"att_123","mediaType":"text/plain","sizeBytes":16},"idempotent":false}"#.utf8
                )
            )
        }

        let client = TRPCClient(
            config: AppConfig(
                serverOrigin: URL(string: "https://haus.test")!,
                productVersion: "1.2.3"
            ),
            sessionTokenProvider: StaticSessionTokenProvider(token: "clerk_123"),
            session: makeStubSession()
        )
        let result = try await client.uploadAttachment(
            serverID: "srv_123",
            attachmentID: "att_123",
            fileURL: fileURL
        )

        XCTAssertEqual(
            result,
            AttachmentUploadResult(
                attachment: AttachmentMetadata(
                    filename: "notes.txt",
                    id: "att_123",
                    mediaType: "text/plain",
                    sizeBytes: 16
                ),
                idempotent: false
            )
        )
    }

    func testAttachmentDownloadWritesBytesToSanitizedTempFilename() async throws {
        let bytes = Data("downloaded bytes".utf8)
        StubURLProtocol.requestHandler = { request in
            XCTAssertEqual(request.httpMethod, "GET")
            XCTAssertEqual(request.url?.path, "/attachments/srv_123/att_123")
            XCTAssertEqual(request.value(forHTTPHeaderField: "x-haus-product-version"), "1.2.3")
            XCTAssertEqual(request.value(forHTTPHeaderField: "x-haus-app-protocol-version"), "7")
            XCTAssertEqual(request.value(forHTTPHeaderField: "authorization"), "Bearer clerk_123")
            return response(headers: ["Content-Type": "text/plain"], data: bytes)
        }

        let client = TRPCClient(
            config: AppConfig(
                serverOrigin: URL(string: "https://haus.test")!,
                productVersion: "1.2.3"
            ),
            sessionTokenProvider: StaticSessionTokenProvider(token: "clerk_123"),
            session: makeStubSession()
        )
        let downloadedURL = try await client.downloadAttachment(
            serverID: "srv_123",
            attachmentID: "att_123",
            displayFilename: "../../notes\n.txt"
        )
        defer {
            try? FileManager.default.removeItem(
                at: downloadedURL.deletingLastPathComponent().deletingLastPathComponent()
            )
        }

        XCTAssertEqual(downloadedURL.lastPathComponent, "notes_.txt")
        XCTAssertEqual(try Data(contentsOf: downloadedURL), bytes)
        XCTAssertTrue(downloadedURL.path.contains("/HausAttachments/"))
    }

    func testDevClerkTicketUsesUnauthenticatedMutation() async throws {
        StubURLProtocol.requestHandler = { request in
            XCTAssertEqual(request.httpMethod, "POST")
            XCTAssertEqual(request.url?.path, "/trpc/dev.createClerkSignInToken")
            XCTAssertNil(request.value(forHTTPHeaderField: "authorization"))
            let body = try XCTUnwrap(request.httpBody ?? request.httpBodyStream.flatMap(readBody))
            XCTAssertEqual(String(decoding: body, as: UTF8.self), "{}")
            return response(data: Data(#"{"result":{"data":{"ticket":"ticket_test"}}}"#.utf8))
        }
        let client = TRPCClient(
            config: AppConfig(
                serverOrigin: URL(string: "http://localhost:46051")!,
                productVersion: "test"
            ),
            sessionTokenProvider: StaticSessionTokenProvider(token: nil),
            session: makeStubSession()
        )

        let result = try await client.createDevClerkSignInTicket()

        XCTAssertEqual(result, DevClerkSignInTicket(ticket: "ticket_test"))
    }

    func testSubscriptionReadsTRPC11SSEDataAndIgnoresControlEvents() async throws {
        StubURLProtocol.requestHandler = { request in
            XCTAssertEqual(request.httpMethod, "GET")
            XCTAssertEqual(request.url?.path, "/trpc/chat.onEvent")
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
            session: makeStubSession()
        )

        var values: [SubscriptionOutput] = []
        let stream: AsyncThrowingStream<SubscriptionOutput, Error> = await client.subscribe(
            "chat.onEvent",
            input: SubscriptionInput(serverID: "srv_123"),
            options: TRPCSubscriptionOptions(reconnect: false)
        )
        for try await value in stream {
            values.append(value)
        }

        XCTAssertEqual(values, [SubscriptionOutput(kind: "message", text: "hello")])
    }

    func testSubscriptionCallsOnConnectedAfterEachReconnect() async throws {
        let callbackCount = SubscriptionCallbackCount()
        nonisolated(unsafe) var requestCount = 0
        StubURLProtocol.requestHandler = { request in
            requestCount += 1
            if requestCount == 1 {
                return response(
                    headers: ["Content-Type": "text/event-stream"],
                    data: Data()
                )
            }
            return response(
                headers: ["Content-Type": "text/event-stream"],
                data: Data("event: return\ndata:\n\n".utf8)
            )
        }
        let client = TRPCClient(
            config: AppConfig(serverOrigin: URL(string: "https://haus.test")!, productVersion: "test"),
            sessionTokenProvider: StaticSessionTokenProvider(token: "token"),
            session: makeStubSession()
        )

        let stream: AsyncThrowingStream<SubscriptionOutput, Error> = await client.subscribe(
            "chat.onEvent",
            input: SubscriptionInput(serverID: "srv_123"),
            options: TRPCSubscriptionOptions(
                initialRetryDelayNanoseconds: 1,
                maximumRetryDelayNanoseconds: 1
            ),
            onConnected: {
                await callbackCount.increment()
            }
        )
        for try await _ in stream {}

        let connectedCount = await callbackCount.value
        XCTAssertEqual(requestCount, 2)
        XCTAssertEqual(connectedCount, 2)
    }

    func testSSEParserHandlesCommentsMultilineDataIDsAndRetry() {
        var parser = SSEParser()
        XCTAssertNil(parser.consume(line: ": a comment"))
        XCTAssertNil(parser.consume(line: "event: message"))
        XCTAssertNil(parser.consume(line: "id: first"))
        XCTAssertNil(parser.consume(line: "data: one"))
        XCTAssertNil(parser.consume(line: "data: two"))
        let first = parser.consume(line: "")
        XCTAssertEqual(
            first,
            ServerSentEvent(
                event: "message",
                data: "one\ntwo",
                id: "first",
                retryMilliseconds: nil
            )
        )

        XCTAssertNil(parser.consume(line: "retry: 2500"))
        XCTAssertNil(parser.consume(line: "data:"))
        let second = parser.consume(line: "")
        XCTAssertEqual(
            second,
            ServerSentEvent(
                event: nil,
                data: "",
                id: "first",
                retryMilliseconds: 2500
            )
        )
    }

    private func makeStubSession() -> URLSession {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [StubURLProtocol.self]
        return URLSession(configuration: configuration)
    }
}

private struct QueryInput: Codable, Equatable {
    let serverID: String
}

private struct QueryOutput: Codable, Equatable {
    let count: Int
}

private struct SubscriptionInput: Codable {
    let serverID: String
}

private struct SubscriptionOutput: Codable, Equatable, Sendable {
    let kind: String
    let text: String
}

private actor SubscriptionCallbackCount {
    private(set) var value = 0

    func increment() {
        value += 1
    }
}

private final class StubURLProtocol: URLProtocol {
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
private struct StubResponse {
    let response: HTTPURLResponse
    let data: Data
}

private func response(
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

private func readBody(_ stream: InputStream) -> Data {
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
