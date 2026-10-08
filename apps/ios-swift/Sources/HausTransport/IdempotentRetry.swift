import Foundation

/// Retries a mutation that Server deduplicates by a client nonce through the
/// failures a phone sees on a bad link: a timeout, a dropped or absent
/// connection, a gateway that could not reach Server. Replaying the same
/// nonce cannot post twice, so a send only reports failure once these retries
/// are spent. Anything Server actually answered (a rejection, a malformed
/// response) fails at once, because retrying it would only fail again.
public enum IdempotentRetry {
    /// Waits before each retry. Three retries span about twelve seconds, on
    /// top of each attempt's own request timeout.
    public static let delays: [Duration] = [.seconds(1), .seconds(3), .seconds(8)]

    public static func run<Output: Sendable>(
        delays: [Duration] = IdempotentRetry.delays,
        sleep: @Sendable (Duration) async throws -> Void = { try await Task.sleep(for: $0) },
        _ operation: @Sendable () async throws -> Output
    ) async throws -> Output {
        var remaining = delays[...]
        while true {
            do {
                return try await operation()
            } catch {
                guard isTransient(error), let delay = remaining.popFirst() else { throw error }
                try await sleep(delay)
            }
        }
    }

    /// Whether a failure says nothing about the request itself, only about
    /// the path to Server.
    public static func isTransient(_ error: any Error) -> Bool {
        switch error {
        case let error as TRPCClientError:
            switch error {
            case .transport: return true
            case let .invalidResponse(status, _): return gatewayStatuses.contains(status)
            case .invalidProcedurePath, .decoding: return false
            }
        case let error as TRPCError:
            return error.httpStatus.map(gatewayStatuses.contains) ?? false
        default:
            return false
        }
    }

    private static let gatewayStatuses: Set<Int> = [502, 503, 504]
}
