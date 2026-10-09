import Foundation

/// The iPhone's realtime subscriptions. Each runs, ends, and restarts on its
/// own: one stream failing never touches its siblings.
public enum RealtimeStream: String, CaseIterable, Hashable, Sendable {
    case messageCreated = "chat.onMessageCreated"
    case messageReactionUpdated = "chat.onMessageReactionUpdated"
    case chatRead = "chat.onRead"
    case threadFollowUpdated = "thread.onFollowUpdated"
    case chatLifecycle = "chat.onLifecycle"
    case cloudAgentWorkUpdated = "cloudAgentWork.onUpdated"
    case taskChanged = "task.onChanged"
    case taskLabelUpdated = "taskLabel.onUpdated"
    case agentLifecycle = "agent.onLifecycle"
    case agentActivity = "agent.onActivity"

    public var path: String { rawValue }

    /// Whether this stream's outage is the Server's: the connection indicator
    /// follows these. Activity and the annotation streams are decoration on
    /// top of messages and presence.
    public var reportsOutage: Bool {
        self == .messageCreated || self == .agentLifecycle
    }

    /// What this stream's (re)start reloads: only the projections it keeps
    /// fresh, and only those the iPhone has loaded.
    public var ownedProjections: Set<RealtimeProjection> {
        switch self {
        case .messageCreated, .messageReactionUpdated, .chatRead, .threadFollowUpdated:
            [.openTranscripts, .chatList]
        case .taskChanged:
            [.openTranscripts, .chatList, .taskLenses]
        case .cloudAgentWorkUpdated:
            [.openTranscripts, .chatList, .activeCloudAgentWork]
        case .chatLifecycle:
            [.chatList]
        case .taskLabelUpdated:
            [.taskLenses]
        case .agentLifecycle:
            [.agentAvailability]
        case .agentActivity:
            [.agentActivity]
        }
    }

    /// Volatile live projections re-read on every connect, the first included;
    /// the others reload only on a restart, after the launch already read them.
    public var recoversOnFirstConnect: Bool {
        self == .agentLifecycle || self == .agentActivity
    }
}

/// A Store projection a stream restart reloads.
public enum RealtimeProjection: Hashable, Sendable, CaseIterable {
    /// Every open transcript list's loaded pages, in bulk (never per entity).
    case openTranscripts
    case chatList
    /// Every loaded task lens.
    case taskLenses
    case activeCloudAgentWork
    case agentAvailability
    case agentActivity
}

/// Why the Server refused or ended a stream (`hausRefusal` in the tRPC error data).
public enum RealtimeRefusal: String, Sendable, Equatable {
    case membershipLost = "membership_lost"
    case roleRequired = "role_required"

    public static let dataKey = "hausRefusal"
}

/// How one stream ended.
public enum RealtimeStreamEnd: Sendable, Equatable {
    /// The Server completed the stream normally.
    case completed
    /// The session token expired or was rejected.
    case unauthorized
    case refused(RealtimeRefusal)
    /// Anything else, including `FORBIDDEN` or `NOT_FOUND` with no refusal.
    case failed
}

/// What the Store does after a stream ends.
public enum RealtimeStreamDecision: Sendable, Equatable {
    /// Restart this stream alone after `delay`, refreshing the session token
    /// first when the Server rejected it.
    case restart(after: Duration, reauthenticate: Bool)
    /// `role_required`: stop this one stream and clear nothing.
    case stop
    /// `membership_lost`: final for every stream of the Server; clear it.
    case membershipLost
}

/// Per-stream restart state: capped exponential backoff (1 s → 30 s), reset
/// once a stream has stayed connected long enough.
public struct RealtimeStreamRestarts: Sendable, Equatable {
    public static let maximumDelay = Duration.seconds(30)
    /// A stream that stayed up this long earned a fresh backoff.
    public static let stableInterval: TimeInterval = 30

    private var attempts: [RealtimeStream: Int] = [:]
    private var connectedAt: [RealtimeStream: Date] = [:]
    private var hasConnected: Set<RealtimeStream> = []
    private var ended: Set<RealtimeStream> = []

    public init() {}

    /// Whether every stream is running (none waiting to restart or stopped).
    public var allRunning: Bool { ended.isEmpty }

    /// Records a connect. Returns whether this is a restart, the trigger for
    /// reloading the stream's owned projections.
    public mutating func connected(_ stream: RealtimeStream, at now: Date) -> Bool {
        connectedAt[stream] = now
        ended.remove(stream)
        return !hasConnected.insert(stream).inserted
    }

    /// Records an end and decides what happens to this stream alone.
    public mutating func ended(_ stream: RealtimeStream, by end: RealtimeStreamEnd, at now: Date) -> RealtimeStreamDecision {
        ended.insert(stream)
        switch end {
        case .refused(.membershipLost):
            return .membershipLost
        case .refused(.roleRequired):
            return .stop
        case .completed, .failed, .unauthorized:
            if let since = connectedAt.removeValue(forKey: stream),
               now.timeIntervalSince(since) >= Self.stableInterval {
                attempts[stream] = 0
            }
            let attempt = attempts[stream, default: 0]
            attempts[stream] = attempt + 1
            let delay = min(RetryBackoff.delay(attempt: attempt), Self.maximumDelay)
            return .restart(after: delay, reauthenticate: end == .unauthorized)
        }
    }
}
