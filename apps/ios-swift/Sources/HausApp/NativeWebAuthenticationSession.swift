import AuthenticationServices
import HausTransport
import UIKit

@MainActor
final class NativeWebAuthenticationSession: NSObject, ASWebAuthenticationPresentationContextProviding {
    private var authenticationSession: ASWebAuthenticationSession?

    func authenticate(_ request: NativeAuthorizationRequest) async throws -> URL {
        try await withCheckedThrowingContinuation { continuation in
            let session = ASWebAuthenticationSession(
                url: request.url,
                callbackURLScheme: request.callbackScheme
            ) { [weak self] callbackURL, error in
                Task { @MainActor in
                    guard let self, self.authenticationSession != nil else { return }
                    self.authenticationSession = nil
                    if let callbackURL {
                        continuation.resume(returning: callbackURL)
                    } else if let error = error as? ASWebAuthenticationSessionError,
                              error.code == .canceledLogin
                    {
                        continuation.resume(throwing: NativeAuthError.authorizationCancelled)
                    } else {
                        continuation.resume(throwing: NativeAuthError.serverUnavailable)
                    }
                }
            }
            session.presentationContextProvider = self
            authenticationSession = session
            guard session.start() else {
                authenticationSession = nil
                continuation.resume(throwing: NativeAuthError.serverUnavailable)
                return
            }
        }
    }

    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        UIApplication.shared.connectedScenes
            .compactMap { ($0 as? UIWindowScene)?.keyWindow }
            .first ?? UIWindow()
    }
}
