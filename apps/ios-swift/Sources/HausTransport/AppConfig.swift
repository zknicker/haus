import Foundation

/// The headers that gate the App ↔ Server wire contract.
public enum HausAppProtocol {
    public static let version = 7
    public static let productVersionHeader = "x-haus-product-version"
    public static let protocolVersionHeader = "x-haus-app-protocol-version"
}

/// Configuration shared by every native request to Haus Server.
public struct AppConfig: Equatable, Sendable {
    public let serverOrigin: URL
    public let productVersion: String
    public let appProtocolVersion: Int

    public init(
        serverOrigin: URL,
        productVersion: String,
        appProtocolVersion: Int = HausAppProtocol.version
    ) {
        self.serverOrigin = serverOrigin
        self.productVersion = productVersion
        self.appProtocolVersion = appProtocolVersion
    }

    public var trpcURL: URL {
        serverOrigin.appendingPathComponent("trpc", isDirectory: false)
    }

    public func headers(sessionToken: String?) -> [String: String] {
        var headers = [
            HausAppProtocol.productVersionHeader: productVersion,
            HausAppProtocol.protocolVersionHeader: String(appProtocolVersion),
        ]
        if let sessionToken, !sessionToken.isEmpty {
            headers["authorization"] = "Bearer \(sessionToken)"
        }
        return headers
    }
}
