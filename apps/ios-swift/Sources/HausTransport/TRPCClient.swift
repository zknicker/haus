import Foundation

/// A small, dependency-free client for the subset of tRPC used by the iPhone
/// app. Queries and mutations intentionally use one POST per operation; this
/// mirrors the existing App client's `methodOverride: 'POST'` configuration.
///
/// Not an actor: every stored property is immutable and Sendable, so requests,
/// SSE consumption, and JSON decoding run concurrently on the cooperative pool
/// instead of queueing behind one another on a single executor.
public final class TRPCClient: Sendable {
    let config: AppConfig
    let sessionTokenProvider: any SessionTokenProvider
    let session: URLSession
    let encoder: JSONEncoder
    let decoder: JSONDecoder

    public init(
        config: AppConfig,
        sessionTokenProvider: any SessionTokenProvider,
        session: URLSession = .shared,
        encoder: JSONEncoder = JSONEncoder(),
        decoder: JSONDecoder = JSONDecoder()
    ) {
        self.config = config
        self.sessionTokenProvider = sessionTokenProvider
        self.session = session
        self.encoder = encoder
        self.decoder = decoder
    }

    public func query<Output: Decodable>(_ path: String) async throws -> Output {
        try await request(path: path, kind: .query, body: nil)
    }

    public func query<Input: Encodable, Output: Decodable>(
        _ path: String,
        input: Input
    ) async throws -> Output {
        try await request(path: path, kind: .query, body: try encode(input))
    }

    public func mutation<Output: Decodable>(_ path: String) async throws -> Output {
        try await request(path: path, kind: .mutation, body: nil)
    }

    /// - Parameter timeout: overrides the session default for one operation. A
    ///   procedure that waits on a slow external provider — image generation is
    ///   the current one — outlives `URLSession`'s 60-second default, and the
    ///   client would otherwise fail a request the Server is still answering.
    public func mutation<Input: Encodable, Output: Decodable>(
        _ path: String,
        input: Input,
        timeout: TimeInterval? = nil
    ) async throws -> Output {
        try await request(path: path, kind: .mutation, body: try encode(input), timeout: timeout)
    }

    private enum OperationKind {
        case query
        case mutation
    }

    private func request<Output: Decodable>(
        path: String,
        kind: OperationKind,
        body: Data?,
        timeout: TimeInterval? = nil
    ) async throws -> Output {
        let url = try procedureURL(path: path)
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        if let timeout {
            request.timeoutInterval = timeout
        }
        request.httpBody = body
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        let token = try await sessionTokenProvider.readSessionToken()
        for (header, value) in config.headers(sessionToken: token) {
            request.setValue(value, forHTTPHeaderField: header)
        }

        do {
            let (data, response) = try await session.data(for: request)
            guard let httpResponse = response as? HTTPURLResponse else {
                throw TRPCClientError.transport("The server returned a non-HTTP response.")
            }
            return try decodeResponse(data, status: httpResponse.statusCode, path: path)
        } catch let error as TRPCError {
            throw error
        } catch let error as TRPCClientError {
            throw error
        } catch is CancellationError {
            throw CancellationError()
        } catch let error as URLError {
            throw TRPCClientError.transport(error.localizedDescription, urlErrorCode: error.code)
        } catch {
            throw TRPCClientError.transport(error.localizedDescription)
        }
    }

    func encode<Value: Encodable>(_ value: Value) throws -> Data {
        do {
            return try encoder.encode(value)
        } catch {
            throw TRPCClientError.decoding(error.localizedDescription)
        }
    }

    func procedureURL(path: String) throws -> URL {
        guard isValidProcedurePath(path) else {
            throw TRPCClientError.invalidProcedurePath(path)
        }
        return config.trpcURL.appendingPathComponent(path, isDirectory: false)
    }

    func subscriptionURL(path: String, input: Data?) throws -> URL {
        let url = try procedureURL(path: path)
        guard let input else {
            return url
        }
        guard let inputString = String(data: input, encoding: .utf8) else {
            throw TRPCClientError.decoding("The subscription input was not valid UTF-8 JSON.")
        }
        guard var components = URLComponents(url: url, resolvingAgainstBaseURL: false),
              let encodedInput = inputString.addingPercentEncoding(
                  withAllowedCharacters: encodeURIComponentAllowedCharacters
              ) else {
            throw TRPCClientError.invalidProcedurePath(path)
        }
        // Match tRPC's `encodeURIComponent(JSON.stringify(input))` exactly.
        components.percentEncodedQuery = "input=\(encodedInput)"
        guard let result = components.url else {
            throw TRPCClientError.invalidProcedurePath(path)
        }
        return result
    }

    private func decodeResponse<Output: Decodable>(
        _ data: Data,
        status: Int,
        path: String
    ) throws -> Output {
        do {
            let envelope = try decoder.decode(TRPCResponseEnvelope<Output>.self, from: data)
            if let error = envelope.error {
                throw TRPCError(
                    message: error.message,
                    code: error.code,
                    data: error.data,
                    httpStatus: status,
                    path: path
                )
            }
            guard let result = envelope.result?.data else {
                if envelope.result != nil, let noContent = TRPCNoContent() as? Output {
                    return noContent
                }
                throw TRPCClientError.invalidResponse(
                    status: status,
                    body: String(data: data, encoding: .utf8) ?? "<non-UTF8>"
                )
            }
            return result
        } catch let error as TRPCError {
            throw error
        } catch let error as TRPCClientError {
            throw error
        } catch {
            try throwResponseError(data, status: status, path: path, decodingError: error)
        }
    }

    func throwResponseError(
        _ data: Data,
        status: Int,
        path: String,
        decodingError: Error? = nil
    ) throws -> Never {
        if let shape = try? decoder.decode(TRPCErrorShape.self, from: data) {
            throw TRPCError(
                message: shape.message,
                code: shape.code,
                data: shape.data,
                httpStatus: status,
                path: path
            )
        }
        if let decodingError {
            throw TRPCClientError.decoding(String(reflecting: decodingError))
        }
        throw TRPCClientError.invalidResponse(
            status: status,
            body: String(data: data, encoding: .utf8) ?? "<non-UTF8>"
        )
    }
}

private func isValidProcedurePath(_ path: String) -> Bool {
    guard !path.isEmpty, !path.contains("/"), !path.contains("?"), !path.contains("#") else {
        return false
    }
    return path.split(separator: ".", omittingEmptySubsequences: false).allSatisfy {
        !$0.isEmpty
    }
}

private let encodeURIComponentAllowedCharacters: CharacterSet = {
    var characters = CharacterSet.alphanumerics
    characters.insert(charactersIn: "-_.!~*'()")
    return characters
}()
