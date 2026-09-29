import Foundation

enum HausRuntimeConfiguration {
    struct Development {
        let clerkPublishableKey: String
        let serverOrigin: URL
    }

    private static let productionClerkPublishableKey = "pk_live_Y2xlcmsuaGF1cy5jaGF0JA"
    private static let productionServerOrigin = URL(string: "https://haus.chat")!
    private static let cachedClerkPublishableKey = "haus.debug.clerk-publishable-key"
    private static let cachedServerOrigin = "haus.debug.server-origin"
    private static let explicitSignOutKey = "haus.debug.explicit-sign-out"

    static var development: Development? {
        #if DEBUG
        let environment = ProcessInfo.processInfo.environment
        if let configured = validatedDevelopment(
            clerkPublishableKey: environment["HAUS_CLERK_PUBLISHABLE_KEY"],
            serverOrigin: environment["HAUS_DEV_SERVER_ORIGIN"]
        ) {
            cache(configured)
            return configured
        }

        let defaults = UserDefaults.standard
        return validatedDevelopment(
            clerkPublishableKey: defaults.string(forKey: cachedClerkPublishableKey),
            serverOrigin: defaults.string(forKey: cachedServerOrigin)
        )
        #else
        nil
        #endif
    }

    /// Debug auto sign-in stands down after an explicit sign-out, across
    /// relaunches, until the human signs in again from the signed-out screen.
    /// Release builds have no auto sign-in, so the flag does not exist there.
    static var hasExplicitlySignedOut: Bool {
        #if DEBUG
        UserDefaults.standard.bool(forKey: explicitSignOutKey)
        #else
        false
        #endif
    }

    static func recordExplicitSignOut() {
        #if DEBUG
        UserDefaults.standard.set(true, forKey: explicitSignOutKey)
        #endif
    }

    static func clearExplicitSignOut() {
        #if DEBUG
        UserDefaults.standard.removeObject(forKey: explicitSignOutKey)
        #endif
    }

    static var clerkPublishableKey: String {
        development?.clerkPublishableKey ?? productionClerkPublishableKey
    }

    static var serverOrigin: URL {
        development?.serverOrigin ?? productionServerOrigin
    }

    #if DEBUG
    private static func validatedDevelopment(
        clerkPublishableKey: String?,
        serverOrigin: String?
    ) -> Development? {
        guard let clerkPublishableKey,
              !clerkPublishableKey.isEmpty,
              let serverOrigin = serverOrigin.flatMap(URL.init(string:)),
              serverOrigin.scheme == "http",
              let serverHost = serverOrigin.host,
              ["localhost", "127.0.0.1", "::1"].contains(serverHost)
        else { return nil }
        return Development(
            clerkPublishableKey: clerkPublishableKey,
            serverOrigin: serverOrigin
        )
    }

    private static func cache(_ development: Development) {
        let defaults = UserDefaults.standard
        defaults.set(development.clerkPublishableKey, forKey: cachedClerkPublishableKey)
        defaults.set(development.serverOrigin.absoluteString, forKey: cachedServerOrigin)
    }
    #endif
}
