import Foundation

/// What this device should tell the Server about its APNs token. Turning
/// Needs you pushes off must reach the Server even when the first attempt
/// fails, so the off intent is persisted (`PendingPushUnregister`) and retried
/// on every launch, foreground, and token delivery until it lands.
public enum PushDeviceSync {
    public enum Action: Sendable, Equatable {
        case register
        case unregister
        case none
    }

    /// Whether to ask APNs for the token. An unregister still pending needs
    /// the token even though pushes are off.
    public static func needsToken(isOn: Bool, pendingUnregister: Bool) -> Bool {
        isOn || pendingUnregister
    }

    public static func action(
        isOn: Bool,
        pendingUnregister: Bool,
        token: String?,
        registeredToken: String?
    ) -> Action {
        guard token != nil else { return .none }
        if isOn { return token == registeredToken ? .none : .register }
        return pendingUnregister ? .unregister : .none
    }
}

/// The persisted "the Server has not yet heard that pushes are off" flag.
public struct PendingPushUnregister {
    public static let storageKey = "haus.notifications.pendingUnregister"
    private let defaults: UserDefaults

    public init(defaults: UserDefaults) {
        self.defaults = defaults
    }

    public var isPending: Bool {
        get { defaults.bool(forKey: Self.storageKey) }
        nonmutating set { defaults.set(newValue, forKey: Self.storageKey) }
    }
}

/// The app icon badge mirrors Needs you.
public enum PushBadge {
    /// Nil until the Needs you rows have loaded, so a cold launch does not
    /// clear a badge the Server set to a count the app has not read yet.
    public static func count(needsYouCount: Int, isReady: Bool) -> Int? {
        isReady ? needsYouCount : nil
    }
}

/// Delivered notifications that opening a Chat answers.
public enum DeliveredPushCleanup {
    public struct Delivered: Sendable, Equatable {
        public let identifier: String
        /// `aps.thread-id`: the conversation (Channel or DM) Chat id.
        public let threadID: String
        public let payload: PushNotificationPayload?

        public init(identifier: String, threadID: String, payload: PushNotificationPayload?) {
            self.identifier = identifier
            self.threadID = threadID
            self.payload = payload
        }
    }

    /// Opening a conversation clears every notification grouped under it
    /// (its `thread-id`); opening a Thread clears the ones sent from it.
    public static func identifiers(_ delivered: [Delivered], openedChatID: String?) -> [String] {
        guard let openedChatID else { return [] }
        return delivered
            .filter { $0.threadID == openedChatID || $0.payload?.chatID == openedChatID }
            .map(\.identifier)
    }
}
