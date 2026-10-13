import Foundation

enum HausRuntimeConfiguration {
    struct Development {
        let clerkPublishableKey: String
        let serverOrigin: URL
        /// The dev stack's website origin, when the launch named one.
        let appOrigin: URL?
    }

    private static let productionClerkPublishableKey = "pk_live_Y2xlcmsuaGF1cy5jaGF0JA"
    private static let productionServerOrigin = URL(string: "https://haus.chat")!
    private static let cachedClerkPublishableKey = "haus.debug.clerk-publishable-key"
    private static let cachedServerOrigin = "haus.debug.server-origin"
    private static let cachedAppOrigin = "haus.debug.app-origin"
    private static let explicitSignOutKey = "haus.debug.explicit-sign-out"

    static var development: Development? {
        #if DEBUG
        let environment = ProcessInfo.processInfo.environment
        if let configured = validatedDevelopment(
            clerkPublishableKey: environment["HAUS_CLERK_PUBLISHABLE_KEY"],
            serverOrigin: environment["HAUS_DEV_SERVER_ORIGIN"],
            appOrigin: environment["HAUS_DEV_APP_ORIGIN"]
        ) {
            cache(configured)
            return configured
        }

        let defaults = UserDefaults.standard
        return validatedDevelopment(
            clerkPublishableKey: defaults.string(forKey: cachedClerkPublishableKey),
            serverOrigin: defaults.string(forKey: cachedServerOrigin),
            appOrigin: defaults.string(forKey: cachedAppOrigin)
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

    /// The App origins a stable artifact URL may carry. Production serves the
    /// App and the Server from one origin; the local dev stack serves the App
    /// on its own port, which `HAUS_DEV_APP_ORIGIN` names (localhost only).
    static var appOrigins: [URL] {
        guard let development else { return [productionServerOrigin] }
        return [development.appOrigin, development.serverOrigin].compactMap { $0 }
    }

    #if DEBUG
    private static func validatedDevelopment(
        clerkPublishableKey: String?,
        serverOrigin: String?,
        appOrigin: String?
    ) -> Development? {
        guard let clerkPublishableKey,
              !clerkPublishableKey.isEmpty,
              let serverOrigin = localOrigin(serverOrigin)
        else { return nil }
        return Development(
            clerkPublishableKey: clerkPublishableKey,
            serverOrigin: serverOrigin,
            appOrigin: localOrigin(appOrigin)
        )
    }

    private static func localOrigin(_ value: String?) -> URL? {
        guard let origin = value.flatMap(URL.init(string:)),
              origin.scheme == "http",
              let host = origin.host,
              ["localhost", "127.0.0.1", "::1"].contains(host)
        else { return nil }
        return origin
    }

    private static func cache(_ development: Development) {
        let defaults = UserDefaults.standard
        defaults.set(development.clerkPublishableKey, forKey: cachedClerkPublishableKey)
        defaults.set(development.serverOrigin.absoluteString, forKey: cachedServerOrigin)
        defaults.set(development.appOrigin?.absoluteString, forKey: cachedAppOrigin)
    }
    #endif
}
