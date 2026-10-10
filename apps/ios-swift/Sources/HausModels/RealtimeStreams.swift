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
    /// The membership sentinel: departures and Server deletion publish
    /// `server.updated`, so this stream ends with `membership_lost` for
    /// whoever just lost access.
    case serverUpdated = "server.onUpdated"

    public var path: String { rawValue }

    /// Whether this stream's outage is the Server's: the connection indicator
    /// follows these. Activity and the annotation streams are decoration on
    /// top of messages and presence.
    public var reportsOutage: Bool {
        self == .messageCreated || self == .agentLifecycle
    }

    /// The projections this stream keeps fresh, and so the ones its starts
    /// reconcile (only those the iPhone has loaded).
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
            // Labels are embedded in transcript entities as well as lenses.
            [.openTranscripts, .taskLenses]
        case .agentLifecycle:
            [.agentAvailability]
        case .agentActivity:
            [.agentActivity]
        case .serverUpdated:
            [.serverList]
        }
    }

    /// Whether every start tail-reads each loaded list: the message stream's
    /// own cheap path for a message committed before it subscribed.
    public var tailsLoadedListsOnStart: Bool { self == .messageCreated }

    /// What one successful start reconciles. Recovery is anchored to the
    /// subscription start, so every start reconciles, the first included. The
    /// message stream's first start leaves the bulk transcript reload to its
    /// tail reads and to the annotation streams starting beside it; a restart
    /// of it alone reloads in bulk, which also repairs a Thread anchor whose
    /// reply event it missed.
    public func startReconciliation(isRestart: Bool) -> Set<RealtimeProjection> {
        guard self == .messageCreated, !isRestart else { return ownedProjections }
        return ownedProjections.subtracting([.openTranscripts])
    }
}

/// A Store projection a stream start reconciles.
public enum RealtimeProjection: Hashable, Sendable, CaseIterable {
    /// Every open transcript list's loaded pages, in bulk (never per entity).
    case openTranscripts
    case chatList
    /// `server.list`: the active Server's name and the viewer's Servers.
    case serverList
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
    /// `NOT_FOUND`: a per-Chat stream named a Chat the Server no longer has.
    case chatMissing = "chat_missing"

    public static let dataKey = "hausRefusal"
}

/// What a per-Chat stream (`chat.onEngagement`, `chat.onThought`) does after
/// it ends.
public enum ChatStreamDecision: Sendable, Equatable {
    /// Restart this stream with backoff while its Chat stays open.
    case restart
    /// `chat_missing`: the Chat is gone. Purge it, as `chat.onLifecycle`
    /// `deleted` does, and stop every stream of that Chat.
    case chatMissing
}

extension RealtimeStreamEnd {
    public var chatStreamDecision: ChatStreamDecision {
        self == .refused(.chatMissing) ? .chatMissing : .restart
    }
}

extension ChatRealtimeEvent {
    /// The `chat.onLifecycle` `deleted` event a `chat_missing` refusal stands
    /// for: the Store applies it through the same path as a live deletion, so
    /// the Chat is purged and the Chat list is read again.
    public static func chatMissing(serverID: String, chatID: String) -> ChatRealtimeEvent {
        .lifecycle(ChatLifecycleEvent(serverID: serverID, chatID: chatID, action: .deleted))
    }
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

    /// Records a connect. Returns whether this is a restart (any connect after
    /// the stream's first), which widens what the message stream reconciles.
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
        // Only per-Chat streams raise `chat_missing`; on a Server-wide one it is transient.
        case .completed, .failed, .unauthorized, .refused(.chatMissing):
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
