import Foundation

/// The viewer's chosen Server, persisted per signed-in user so a cold launch
/// restores it and a second account never inherits it.
@MainActor
public final class ActiveServerPreference {
    public static let keyPrefix = "haus.activeServerID."

    private let defaults: UserDefaults
    private let key: String

    public init(userID: String, defaults: UserDefaults = .standard) {
        self.defaults = defaults
        key = Self.keyPrefix + userID
    }

    public var serverID: String? {
        defaults.string(forKey: key)
    }

    public func save(_ serverID: String) {
        guard self.serverID != serverID else { return }
        defaults.set(serverID, forKey: key)
    }

    public func clear() {
        defaults.removeObject(forKey: key)
    }
}
