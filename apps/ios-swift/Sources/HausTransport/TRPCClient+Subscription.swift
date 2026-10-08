import Foundation

extension TRPCClient {
    public func subscribe<Event: Decodable & Sendable>(
        _ path: String,
        options: TRPCSubscriptionOptions = .init(),
        onConnected: (@Sendable () async -> Void)? = nil,
        onDisconnected: (@Sendable () async -> Void)? = nil
    ) -> AsyncThrowingStream<Event, Error> {
        makeSubscription(
            path: path,
            input: nil,
            options: options,
            onConnected: onConnected,
            onDisconnected: onDisconnected
        )
    }

    public func subscribe<Input: Encodable, Event: Decodable & Sendable>(
        _ path: String,
        input: Input,
        options: TRPCSubscriptionOptions = .init(),
        onConnected: (@Sendable () async -> Void)? = nil,
        onDisconnected: (@Sendable () async -> Void)? = nil
    ) -> AsyncThrowingStream<Event, Error> {
        do {
            return makeSubscription(
                path: path,
                input: try encode(input),
                options: options,
                onConnected: onConnected,
                onDisconnected: onDisconnected
            )
        } catch {
            return AsyncThrowingStream { continuation in
                continuation.finish(throwing: error)
            }
        }
    }

    private func makeSubscription<Event: Decodable & Sendable>(
        path: String,
        input: Data?,
        options: TRPCSubscriptionOptions,
        onConnected: (@Sendable () async -> Void)?,
        onDisconnected: (@Sendable () async -> Void)?
    ) -> AsyncThrowingStream<Event, Error> {
        AsyncThrowingStream { continuation in
            // Detached so the read loop never runs on the subscriber's actor:
            // a stream started from the main actor must not parse bytes there.
            let task = Task.detached { [self] in
                do {
                    try await streamSubscription(
                        path: path,
                        input: input,
                        options: options,
                        onConnected: onConnected,
                        onDisconnected: onDisconnected,
                        yield: { event in continuation.yield(event) }
                    )
                    continuation.finish()
                } catch is CancellationError {
                    continuation.finish()
                } catch {
                    continuation.finish(throwing: error)
                }
            }
            continuation.onTermination = { _ in
                task.cancel()
            }
        }
    }

    private func streamSubscription<Event: Decodable & Sendable>(
        path: String,
        input: Data?,
        options: TRPCSubscriptionOptions,
        onConnected: (@Sendable () async -> Void)?,
        onDisconnected: (@Sendable () async -> Void)?,
        yield: @escaping @Sendable (Event) -> Void
    ) async throws {
        _ = try procedureURL(path: path)
        var retryDelay = options.initialRetryDelayNanoseconds

        while !Task.isCancelled {
            do {
                let ended = try await consumeSubscription(
                    path: path,
                    input: input,
                    onConnected: onConnected,
                    yield: yield
                )
                if ended || !options.reconnect {
                    return
                }
                // The Server dropped a live stream; it reconnects at once.
                await onDisconnected?()
                retryDelay = options.initialRetryDelayNanoseconds
            } catch is CancellationError {
                throw CancellationError()
            } catch let error as TRPCError {
                // Auth, protocol, and procedure errors are not repaired by
                // reconnecting the same request.
                throw error
            } catch {
                guard options.reconnect else {
                    throw error
                }
                // Reconnecting hides the outage from the stream's consumer,
                // so the transport says so here: a refused or dropped
                // connection is reported on every failed attempt.
                await onDisconnected?()
                try await Task.sleep(nanoseconds: retryDelay)
                let doubled = retryDelay.multipliedReportingOverflow(by: 2)
                retryDelay = doubled.overflow
                    ? options.maximumRetryDelayNanoseconds
                    : min(doubled.partialValue, options.maximumRetryDelayNanoseconds)
            }
        }
    }

    /// Returns true when the server explicitly sent tRPC's `return` event.
    private func consumeSubscription<Event: Decodable & Sendable>(
        path: String,
        input: Data?,
        onConnected: (@Sendable () async -> Void)?,
        yield: @escaping @Sendable (Event) -> Void
    ) async throws -> Bool {
        let url = try subscriptionURL(path: path, input: input)
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.setValue("text/event-stream", forHTTPHeaderField: "Accept")
        request.setValue("no-cache", forHTTPHeaderField: "Cache-Control")
        let token = try await sessionTokenProvider.readSessionToken()
        for (header, value) in config.headers(sessionToken: token) {
            request.setValue(value, forHTTPHeaderField: header)
        }

        let (bytes, response) = try await session.bytes(for: request)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw TRPCClientError.transport("The server returned a non-HTTP response.")
        }
        guard (200..<300).contains(httpResponse.statusCode) else {
            try throwResponseError(
                try await readAll(bytes),
                status: httpResponse.statusCode,
                path: path
            )
        }
        await onConnected?()

        var parser = SSEParser()
        let ended = try await consumeSSEBytes(bytes, parser: &parser) { event in
            try handle(event: event, path: path, yield: yield)
            return event.event == "return"
        }
        if ended {
            return true
        }
        if let event = parser.finish() {
            try handle(event: event, path: path, yield: yield)
            return event.event == "return"
        }
        return false
    }

    /// `AsyncBytes.lines` omits empty lines, but an empty line is the SSE
    /// dispatch delimiter. Keep our own splitter so blank lines and UTF-8 data
    /// are preserved exactly. `AsyncBytes` already buffers the socket, so the
    /// per-byte step is a buffer read; the line accumulates in a reused array.
    private func consumeSSEBytes(
        _ bytes: URLSession.AsyncBytes,
        parser: inout SSEParser,
        handle: (ServerSentEvent) throws -> Bool
    ) async throws -> Bool {
        var line: [UInt8] = []
        line.reserveCapacity(4096)
        for try await byte in bytes {
            guard byte == 0x0A else {
                line.append(byte)
                continue
            }
            let text = String(decoding: line, as: UTF8.self)
            line.removeAll(keepingCapacity: true)
            if let event = parser.consume(line: text), try handle(event) {
                return true
            }
        }
        if !line.isEmpty, let event = parser.consume(line: String(decoding: line, as: UTF8.self)) {
            return try handle(event)
        }
        return false
    }

    private func readAll(_ bytes: URLSession.AsyncBytes) async throws -> Data {
        var data: [UInt8] = []
        for try await byte in bytes {
            data.append(byte)
        }
        return Data(data)
    }

    private func handle<Event: Decodable & Sendable>(
        event: ServerSentEvent,
        path: String,
        yield: @escaping @Sendable (Event) -> Void
    ) throws {
        switch event.event {
        case "connected", "ping", "return":
            return
        case "serialized-error":
            let data = Data(event.data.utf8)
            let shape = try decoder.decode(TRPCErrorShape.self, from: data)
            throw TRPCError(
                message: shape.message,
                code: shape.code,
                data: shape.data,
                path: path
            )
        default:
            guard !event.data.isEmpty else {
                return
            }
            do {
                yield(try decoder.decode(SSEDataFrame<Event>.self, from: Data(event.data.utf8)).value)
            } catch {
                throw TRPCClientError.decoding(error.localizedDescription)
            }
        }
    }
}

/// One SSE data frame, decoded in a single pass.
///
/// tRPC 11 frames carry the serialized output directly, unlike query and
/// mutation envelopes. A `{"data": …}` envelope (optionally with an `id`) is
/// still accepted so fixtures and future adapters remain safe; any other shape
/// is the output itself.
struct SSEDataFrame<Event: Decodable>: Decodable {
    let value: Event

    init(from decoder: Decoder) throws {
        if let keyed = try? decoder.container(keyedBy: FrameKey.self),
           keyed.contains(.data),
           keyed.allKeys.allSatisfy({ $0 == .data || $0 == .id }) {
            value = try keyed.decode(Event.self, forKey: .data)
        } else {
            value = try Event(from: decoder)
        }
    }

    private enum FrameKey: String, CodingKey {
        case data
        case id
    }
}
