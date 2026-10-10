import Foundation
import Network

/// A loopback HTTP/1.1 server for connection-pool tests. URLProtocol stubs
/// bypass URLSession's connection pool, so per-host limits only show against a
/// real socket. Paths starting with `stream.` answer an SSE head and hold the
/// connection open; every other path answers a tRPC query result and keeps the
/// connection alive for reuse.
final class LoopbackHTTPServer: @unchecked Sendable {
    private let listener: NWListener
    private let queue = DispatchQueue(label: "LoopbackHTTPServer")
    // Touched only on `queue`.
    private var connections: [NWConnection] = []

    init() throws {
        let parameters = NWParameters.tcp
        parameters.requiredLocalEndpoint = .hostPort(host: .ipv4(.loopback), port: .any)
        listener = try NWListener(using: parameters)
    }

    /// Starts listening and returns the server's origin.
    func start() async throws -> URL {
        try await withCheckedThrowingContinuation { continuation in
            nonisolated(unsafe) var resumed = false
            listener.stateUpdateHandler = { [listener] state in
                guard !resumed else { return }
                switch state {
                case .ready:
                    resumed = true
                    let port = listener.port?.rawValue ?? 0
                    continuation.resume(returning: URL(string: "http://127.0.0.1:\(port)")!)
                case let .failed(error):
                    resumed = true
                    continuation.resume(throwing: error)
                default:
                    break
                }
            }
            listener.newConnectionHandler = { [weak self] connection in
                self?.accept(connection)
            }
            listener.start(queue: queue)
        }
    }

    func stop() {
        queue.sync {
            connections.forEach { $0.cancel() }
            connections = []
        }
        listener.cancel()
    }

    private func accept(_ connection: NWConnection) {
        connections.append(connection)
        connection.start(queue: queue)
        receive(on: connection, buffer: Data())
    }

    private func receive(on connection: NWConnection, buffer: Data) {
        connection.receive(minimumIncompleteLength: 1, maximumLength: 65_536) { [weak self] data, _, isComplete, error in
            guard let self else { return }
            var buffer = buffer
            if let data {
                buffer.append(data)
            }
            while let request = Self.takeRequest(from: &buffer) {
                if request.contains("/stream.") {
                    connection.send(content: Data(Self.streamHead.utf8), completion: .contentProcessed { _ in })
                    // A held stream answers nothing more on this connection.
                    return
                }
                connection.send(content: Data(Self.queryResponse.utf8), completion: .contentProcessed { _ in })
            }
            guard !isComplete, error == nil else {
                connection.cancel()
                return
            }
            receive(on: connection, buffer: buffer)
        }
    }

    /// Removes one complete request (head plus `Content-Length` body) from the
    /// buffer and returns its request line.
    private static func takeRequest(from buffer: inout Data) -> String? {
        guard let headEnd = buffer.range(of: Data("\r\n\r\n".utf8)) else { return nil }
        let head = String(decoding: buffer[buffer.startIndex..<headEnd.lowerBound], as: UTF8.self)
        let lines = head.components(separatedBy: "\r\n")
        let length = lines.lazy
            .compactMap { line -> Int? in
                let parts = line.split(separator: ":", maxSplits: 1)
                guard parts.count == 2, parts[0].lowercased() == "content-length" else { return nil }
                return Int(parts[1].trimmingCharacters(in: .whitespaces))
            }
            .first ?? 0
        let requestEnd = headEnd.upperBound + length
        guard buffer.endIndex >= requestEnd else { return nil }
        buffer = Data(buffer[requestEnd...])
        return lines.first
    }

    private static let streamHead = [
        "HTTP/1.1 200 OK",
        "Content-Type: text/event-stream",
        "Cache-Control: no-cache",
        "Connection: keep-alive",
        "",
        "",
    ].joined(separator: "\r\n") + "event: connected\ndata: {}\n\n"

    private static let queryResponse: String = {
        let body = #"{"result":{"data":{"count":1}}}"#
        return [
            "HTTP/1.1 200 OK",
            "Content-Type: application/json",
            "Content-Length: \(body.utf8.count)",
            "Connection: keep-alive",
            "",
            body,
        ].joined(separator: "\r\n")
    }()
}
