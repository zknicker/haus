import Foundation
import HausModels

/// The client's two URL sessions: one for queries and mutations, one for SSE
/// subscriptions.
///
/// Every subscription holds a connection open for as long as it runs. Over
/// HTTP/1.1 (the local dev Server) each stream is its own connection, and a
/// session with the stock six-per-host limit hands all six to streams, so every
/// query and send queued behind them until it timed out. Production's HTTP/2
/// multiplexes, but the client must not depend on that: queries never share a
/// connection pool with streams.
public enum TRPCSessions {
    /// Chat-scoped streams per open Chat header: `chat.onEngagement` and
    /// `chat.onThought`.
    static let streamsPerOpenChat = 2
    /// Chat headers that can be alive at once (a pushed Thread over its Chat,
    /// a transition overlapping the next Chat).
    static let openChatAllowance = 4
    /// Room for a restart overlapping its predecessor's teardown.
    static let streamHeadroom = 4

    /// Every stream the App can hold at once, with headroom. Derived from the
    /// stream inventory so adding a Server-wide stream raises the limit.
    public static let streamConnectionsPerHost =
        RealtimeStream.allCases.count + streamsPerOpenChat * openChatAllowance + streamHeadroom

    /// The longest a stream may sit without a byte before the transport drops
    /// and reconnects it. The Server sends no SSE pings, so this bounds how long
    /// a silently dead socket goes unnoticed; a quiet healthy stream that hits
    /// it reconnects and reconciles like any other restart. The 60-second
    /// default recycled every idle stream once a minute.
    public static let streamIdleTimeout: TimeInterval = 300

    /// Queries and mutations: stock limits and timeouts.
    public static let requests = URLSession(configuration: makeRequestConfiguration())

    /// Long-lived SSE subscriptions.
    public static let streams = URLSession(configuration: makeStreamConfiguration())

    public static func makeRequestConfiguration() -> URLSessionConfiguration {
        .default
    }

    public static func makeStreamConfiguration() -> URLSessionConfiguration {
        let configuration = URLSessionConfiguration.default
        configuration.httpMaximumConnectionsPerHost = streamConnectionsPerHost
        configuration.timeoutIntervalForRequest = streamIdleTimeout
        configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
        configuration.urlCache = nil
        return configuration
    }
}
