import Foundation

public struct AppSessionUser: Codable, Equatable, Sendable {
    public let avatarId: String?
    public let displayName: String?
    public let email: String?
    public let id: String
}

public struct AppSession: Codable, Equatable, Sendable {
    public let accessToken: String
    public let expiresAt: String
    public let issuedAt: String
    public let sessionId: String
    public let user: AppSessionUser

    public var expirationDate: Date? { NativeAuthDate.parse(expiresAt) }
}

public struct NativeAppSession: Codable, Equatable, Sendable {
    public let session: AppSession
    public let sessionExpiresAt: String
    public let sessionToken: String

    public var resumeExpirationDate: Date? { NativeAuthDate.parse(sessionExpiresAt) }
}

public struct AppAuthConfig: Decodable, Equatable, Sendable {
    public let clientId: String
    public let issuer: URL
    public let redirectUri: URL
    public let resource: URL
}

public struct NativeAuthCredentials: Codable, Equatable, Sendable {
    public var cloudflareAccessToken: String?
    public var cloudflareAccessExpiresAt: Date?
    public var cloudflareRefreshToken: String?
    public var sessionExpiresAt: String?
    public var sessionToken: String?
    public let source: Source

    public enum Source: String, Codable, Equatable, Sendable {
        case cloudflare
        case development
    }

    public init(source: Source) {
        self.source = source
    }
}

public enum NativeAuthEvent: Equatable, Sendable {
    case authenticated(AppSession)
    case signedOut
}

public enum NativeAuthError: Error, Equatable, LocalizedError, Sendable {
    case accountNotAllowed
    case authorizationCancelled
    case invalidCallback
    case invalidConfiguration
    case invalidGrant
    case invalidResponse
    case networkUnavailable
    case serverUnavailable
    case sessionRequired
    case secureStorage
    case providerRejected(String)

    public var errorDescription: String? {
        switch self {
        case .accountNotAllowed:
            "This Google account does not have access to Haus."
        case .authorizationCancelled:
            "Google sign-in was cancelled."
        case .invalidCallback:
            "Google sign-in could not be verified. Try again."
        case .invalidConfiguration:
            "Haus sign-in is not configured correctly. Try again later."
        case .invalidGrant, .sessionRequired:
            "Your Haus sign-in expired. Sign in again to continue."
        case .invalidResponse:
            "Haus received an invalid sign-in response. Try again."
        case .networkUnavailable:
            "Haus could not reach the sign-in service. Check your connection and try again."
        case .serverUnavailable:
            "Haus sign-in is temporarily unavailable. Try again in a moment."
        case .secureStorage:
            "Haus could not save sign-in securely on this device."
        case let .providerRejected(message):
            message
        }
    }

    public var requiresSignIn: Bool {
        switch self {
        case .accountNotAllowed, .invalidGrant, .sessionRequired:
            true
        default:
            false
        }
    }
}

public struct NativeAuthorizationRequest: Equatable, Sendable {
    public let url: URL
    public let callbackScheme: String
}

struct CloudflareOAuthMetadata: Decodable, Equatable, Sendable {
    let issuer: String
    let authorizationEndpoint: URL
    let tokenEndpoint: URL
    let revocationEndpoint: URL
    let tokenEndpointAuthMethodsSupported: [String]
    let grantTypesSupported: [String]
    let codeChallengeMethodsSupported: [String]

    enum CodingKeys: String, CodingKey {
        case authorizationEndpoint = "authorization_endpoint"
        case codeChallengeMethodsSupported = "code_challenge_methods_supported"
        case grantTypesSupported = "grant_types_supported"
        case issuer
        case revocationEndpoint = "revocation_endpoint"
        case tokenEndpoint = "token_endpoint"
        case tokenEndpointAuthMethodsSupported = "token_endpoint_auth_methods_supported"
    }
}

struct CloudflareTokenSet: Decodable, Equatable, Sendable {
    let accessToken: String
    let refreshToken: String?
    let expiresIn: Int
    let tokenType: String?

    enum CodingKeys: String, CodingKey {
        case accessToken = "access_token"
        case expiresIn = "expires_in"
        case refreshToken = "refresh_token"
        case tokenType = "token_type"
    }
}

struct NativeAuthDate {
    static func parse(_ value: String) -> Date? {
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let wholeSeconds = ISO8601DateFormatter()
        wholeSeconds.formatOptions = [.withInternetDateTime]
        return fractional.date(from: value) ?? wholeSeconds.date(from: value)
    }
}
