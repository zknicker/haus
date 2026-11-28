import HausModels
import Observation

/// The push route table (specs/ios-app.md): where each payload's tap lands.
public enum PushRouteTable {
    /// - Parameter captainOf: the Captain whose chat a Chat id is, once the
    ///   Chat list knows it.
    public static func request(for push: HausPush, captainOf: (String) -> String? = { _ in nil }) -> RouterRequest {
        switch push {
        case let .message(message):
            .open(route(for: message, captainOf: captainOf))
        case .issue:
            .root(.home)
        }
    }

    static func route(for message: PushNotificationPayload, captainOf: (String) -> String?) -> HausRoute {
        switch message.route {
        case let .task(taskID, _):
            return .task(taskID: taskID, messageID: message.messageID)
        case let .chat(chatID):
            switch message.conversationKind {
            case .captain:
                guard let agentID = captainOf(chatID) else { return .dm(chatID: chatID, messageID: message.messageID) }
                return .captain(agentID: agentID, messageID: message.messageID)
            case .dm:
                return .dm(chatID: chatID, messageID: message.messageID)
            case .channel, nil:
                return .channel(chatID: chatID, messageID: message.messageID)
            }
        }
    }
}

/// A tapped notification on its way to the router. A cold-launch tap waits
/// until the router mounts; a tap for another Server waits for the switch;
/// the tap is consumed only once it routes, or dropped when the person no
/// longer belongs to its Server.
@MainActor
@Observable
public final class PushTaps {
    public private(set) var pending: HausPush?
    public private(set) var isMounted = false
    /// Why the last tap went nowhere.
    public private(set) var notice: String?

    public init() {}

    public func receive(_ push: HausPush) {
        pending = push
    }

    public func mount() {
        isMounted = true
    }

    public func unmount() {
        isMounted = false
    }

    public func clearNotice() {
        notice = nil
    }

    /// Sign-out: a waiting tap belongs to the account that is leaving.
    public func discard() {
        pending = nil
        notice = nil
    }

    /// Routes the pending tap if it can, and says what is left to do.
    public func route(
        into router: HausRouter,
        activeServerID: String?,
        memberServerIDs: [String],
        captainOf: (String) -> String? = { _ in nil }
    ) -> PushTapOutcome {
        guard isMounted, let push = pending else { return .idle }
        if push.serverID == activeServerID {
            router.apply(PushRouteTable.request(for: push, captainOf: captainOf), from: .outside)
            pending = nil
            return .routed
        }
        guard memberServerIDs.contains(push.serverID) else {
            pending = nil
            notice = "That notification is from a Server you're no longer in."
            return .dropped
        }
        return .needsSwitch(push.serverID)
    }
}

public enum PushTapOutcome: Equatable, Sendable {
    case idle
    case routed
    case dropped
    /// Switch to this Server, then route again.
    case needsSwitch(String)
}
