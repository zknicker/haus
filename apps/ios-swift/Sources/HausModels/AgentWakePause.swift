import Foundation

/// Present while the Server has paused an Agent's automatic wakes after
/// repeated failed turns. Automatic work keeps queuing; one probe runs at
/// `nextProbeAt`, and any human message, Start, Restart, reset, or
/// runtime/model change lifts the pause.
///
/// The failure kind and code stay raw strings: they are Server enums that grow
/// independently of this build, and copy falls back for values it does not know.
public struct AgentWakePause: Codable, Sendable, Equatable, Hashable {
    public struct Failure: Codable, Sendable, Equatable, Hashable {
        public let at: Date
        /// The stable failure code, such as `rate-limited`; null when the
        /// runtime reported only a kind.
        public let code: String?
        /// The failure category, such as `authentication` or `timeout`.
        public let kind: String

        public init(at: Date, code: String?, kind: String) {
            self.at = at
            self.code = code
            self.kind = kind
        }
    }

    public let failureCount: Int
    public let lastFailure: Failure
    /// Null while the probe run is in flight.
    public let nextProbeAt: Date?
    public let pausedAt: Date

    public init(failureCount: Int, lastFailure: Failure, nextProbeAt: Date?, pausedAt: Date) {
        self.failureCount = failureCount
        self.lastFailure = lastFailure
        self.nextProbeAt = nextProbeAt
        self.pausedAt = pausedAt
    }
}
