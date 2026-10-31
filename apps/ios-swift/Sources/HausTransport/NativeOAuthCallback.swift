import CryptoKit
import Foundation
import Security

struct NativeOAuthTransaction: Sendable {
    let state: String
    let verifier: String
    let generation: Int
    let revision: UInt64
    let oauth: CloudflareOAuthClient
}

struct NativePKCEChallenge: Equatable, Sendable {
    let state: String
    let verifier: String
    let challenge: String

    static func create() throws -> Self {
        let state = try randomURLSafeString()
        while true {
            let verifier = try randomURLSafeString()
            let digest = SHA256.hash(data: Data(verifier.utf8))
            let challenge = base64URL(Data(digest))
            guard challenge.first.map(isAlphaNumeric) == true else { continue }
            return Self(state: state, verifier: verifier, challenge: challenge)
        }
    }

    private static func randomURLSafeString() throws -> String {
        var bytes = [UInt8](repeating: 0, count: 32)
        guard SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes) == errSecSuccess else {
            throw NativeAuthError.invalidResponse
        }
        return base64URL(Data(bytes))
    }

    private static func base64URL(_ data: Data) -> String {
        data.base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }

    private static func isAlphaNumeric(_ character: Character) -> Bool {
        character.isASCII && character.isLetter || character.isASCII && character.isNumber
    }
}

enum NativeOAuthCallback {
    static func code(from url: URL, expectedState: String) throws -> String {
        guard var components = URLComponents(url: url, resolvingAgainstBaseURL: false),
              components.scheme == "haus",
              components.host == "sso-callback",
              components.path.isEmpty,
              components.user == nil,
              components.password == nil,
              components.port == nil,
              components.fragment == nil
        else { throw NativeAuthError.invalidCallback }

        let items = components.queryItems ?? []
        let values = Dictionary(grouping: items, by: \.name)
        guard values.values.allSatisfy({ $0.count == 1 }),
              Set(values.keys).isSubset(of: ["code", "state", "error", "error_description"]),
              values["state"]?.first?.value == expectedState
        else { throw NativeAuthError.invalidCallback }

        if let error = values["error"]?.first?.value {
            let description = values["error_description"]?.first?.value
            if error == "access_denied" {
                throw NativeAuthError.accountNotAllowed
            }
            throw NativeAuthError.providerRejected(description ?? "Google sign-in failed. Try again.")
        }
        guard let code = values["code"]?.first?.value, !code.isEmpty else {
            throw NativeAuthError.invalidCallback
        }
        components.queryItems = nil
        return code
    }
}
