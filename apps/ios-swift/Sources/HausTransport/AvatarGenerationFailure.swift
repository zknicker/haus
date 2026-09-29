import Foundation

/// Why an avatar operation stopped, in the words the human reads.
///
/// The Server answers `avatar.generate` and `avatar.set` with tRPC error codes
/// whose raw shape ("tRPC error -32603: …") is not product copy. This maps each
/// documented outcome onto one sentence that says what happened and what to do
/// next, and keeps the Server's own message when it already reads that way —
/// an authorization refusal names the exact rule the human broke.
public enum AvatarGenerationFailure: Error, Equatable, LocalizedError, Sendable {
    /// No image provider is configured on this Server.
    case notConfigured
    /// Generation capacity is momentarily full.
    case busy
    /// The signed-in human may not change this avatar.
    case notAllowed(String)
    /// The image provider failed or returned an unusable image.
    case providerFailed
    /// The Agent or Server is gone.
    case missingOwner(String)
    /// The request never reached the Server, or the wait ran out.
    case unreachable

    public var errorDescription: String? {
        switch self {
        case .notConfigured:
            "Avatar generation isn't set up on this Server yet. A Server Owner has to add an image provider key."
        case .busy:
            "Another avatar is still being drawn. Try again in a moment."
        case let .notAllowed(message):
            message
        case .providerFailed:
            "The image provider couldn't finish this avatar. Try again, or describe the concept a little differently."
        case let .missingOwner(message):
            message
        case .unreachable:
            "Haus couldn't be reached. Check your connection and try again."
        }
    }

    /// Classifies one thrown transport error. Anything unrecognized reports as
    /// a provider failure, which is the retryable outcome — a raw tRPC string
    /// is never shown to a human.
    public static func from(_ error: Error) -> AvatarGenerationFailure {
        if let clientError = error as? TRPCClientError {
            if case .transport = clientError {
                return .unreachable
            }
            return .providerFailed
        }

        guard let trpcError = error as? TRPCError else {
            return .unreachable
        }

        switch trpcError.domainCode ?? "" {
        case "PRECONDITION_FAILED":
            return .notConfigured
        case "TOO_MANY_REQUESTS":
            return .busy
        case "FORBIDDEN", "UNAUTHORIZED":
            return .notAllowed(trpcError.message)
        case "NOT_FOUND":
            return .missingOwner(trpcError.message)
        default:
            return .providerFailed
        }
    }
}
