import Foundation

struct CloudflareOAuthClient: Sendable {
    let config: AppAuthConfig
    let metadata: CloudflareOAuthMetadata
    let session: URLSession

    static func discover(config: AppAuthConfig, session: URLSession) async throws -> Self {
        guard config.issuer.absoluteString == NativeAuthConstants.issuer.absoluteString,
              isTrustedHTTPS(config.issuer),
              config.clientId.range(of: "^[A-Za-z0-9-]+$", options: .regularExpression) != nil,
              let resource = URL(string: "https://haus.chat/auth/session"),
              config.resource == resource,
              let redirect = URL(string: "https://haus.chat/auth/callback"),
              config.redirectUri == redirect
        else { throw NativeAuthError.invalidConfiguration }

        var components = URLComponents(url: config.issuer, resolvingAgainstBaseURL: false)
        components?.path = "/.well-known/oauth-authorization-server"
        guard let metadataURL = components?.url else { throw NativeAuthError.invalidConfiguration }
        let (data, response) = try await NativeAuthHTTP.send(URLRequest(url: metadataURL), using: session)
        try NativeAuthHTTP.requireSuccess(response, body: data)

        guard let metadata = try? JSONDecoder().decode(CloudflareOAuthMetadata.self, from: data),
              metadata.issuer == config.issuer.absoluteString,
              isTrustedEndpoint(metadata.authorizationEndpoint, issuer: config.issuer),
              isTrustedEndpoint(metadata.tokenEndpoint, issuer: config.issuer),
              isTrustedEndpoint(metadata.revocationEndpoint, issuer: config.issuer),
              metadata.tokenEndpointAuthMethodsSupported.contains("none"),
              metadata.grantTypesSupported.contains("authorization_code"),
              metadata.grantTypesSupported.contains("refresh_token"),
              metadata.codeChallengeMethodsSupported.contains("S256")
        else { throw NativeAuthError.invalidConfiguration }

        return Self(config: config, metadata: metadata, session: session)
    }

    func exchange(code: String, verifier: String) async throws -> CloudflareTokenSet {
        try await tokenRequest([
            "client_id": config.clientId,
            "code": code,
            "code_verifier": verifier,
            "grant_type": "authorization_code",
            "redirect_uri": config.redirectUri.absoluteString,
            "resource": config.resource.absoluteString,
        ])
    }

    func refresh(refreshToken: String) async throws -> CloudflareTokenSet {
        try await tokenRequest([
            "client_id": config.clientId,
            "grant_type": "refresh_token",
            "refresh_token": refreshToken,
            "resource": config.resource.absoluteString,
        ])
    }

    func revoke(refreshToken: String) async throws {
        var request = URLRequest(url: metadata.revocationEndpoint)
        request.httpMethod = "POST"
        request.httpBody = NativeAuthHTTP.formBody([
            "client_id": config.clientId,
            "token": refreshToken,
            "token_type_hint": "refresh_token",
        ])
        request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        let (data, response) = try await NativeAuthHTTP.send(request, using: session)
        try NativeAuthHTTP.requireSuccess(response, body: data)
    }

    private func tokenRequest(_ fields: [String: String]) async throws -> CloudflareTokenSet {
        var request = URLRequest(url: metadata.tokenEndpoint)
        request.httpMethod = "POST"
        request.httpBody = NativeAuthHTTP.formBody(fields)
        request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        let (data, response) = try await NativeAuthHTTP.send(request, using: session)
        guard (200..<300).contains(response.statusCode) else {
            throw providerError(body: data, status: response.statusCode)
        }
        guard let tokens = try? JSONDecoder().decode(CloudflareTokenSet.self, from: data),
              !tokens.accessToken.isEmpty,
              tokens.expiresIn > 0,
              tokens.tokenType?.lowercased() == "bearer"
        else { throw NativeAuthError.invalidResponse }
        return tokens
    }

    private func providerError(body: Data, status: Int) -> NativeAuthError {
        let response = try? JSONDecoder().decode(CloudflareOAuthError.self, from: body)
        return switch response?.error {
        case "invalid_grant":
            .invalidGrant
        case "access_denied":
            .accountNotAllowed
        default:
            status == 401 || status == 403
                ? .accountNotAllowed
                : .providerRejected(response?.description ?? "Google sign-in failed. Try again.")
        }
    }
}

struct CloudflareOAuthError: Decodable {
    let error: String?
    let description: String?

    enum CodingKeys: String, CodingKey {
        case error
        case description = "error_description"
    }
}

enum NativeAuthConstants {
    static let callbackURL = URL(string: "haus://sso-callback")!
    static let issuer = URL(string: "https://thearcade.cloudflareaccess.com")!
    static let authSessionPath = "auth/session"
    static let authStartPath = "auth/start"
    static let callbackScheme = "haus"
}

enum NativeAuthHTTP {
    static func makeSession() -> URLSession {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.httpCookieStorage = nil
        configuration.httpShouldSetCookies = false
        configuration.urlCache = nil
        configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
        return URLSession(configuration: configuration)
    }

    static func send(_ request: URLRequest, using session: URLSession) async throws -> (Data, HTTPURLResponse) {
        do {
            let (data, response) = try await session.data(for: request, delegate: RejectRedirectsDelegate())
            guard let response = response as? HTTPURLResponse else { throw NativeAuthError.invalidResponse }
            guard response.url == request.url else { throw NativeAuthError.invalidResponse }
            return (data, response)
        } catch is CancellationError {
            throw CancellationError()
        } catch let error as NativeAuthError {
            throw error
        } catch {
            throw NativeAuthError.networkUnavailable
        }
    }

    static func requireSuccess(_ response: HTTPURLResponse, body: Data) throws {
        guard (200..<300).contains(response.statusCode) else {
            if response.statusCode == 401 || response.statusCode == 403 {
                throw NativeAuthError.sessionRequired
            }
            throw NativeAuthError.serverUnavailable
        }
        guard !body.isEmpty else { throw NativeAuthError.invalidResponse }
    }

    static func formBody(_ fields: [String: String]) -> Data {
        let query = fields.keys.sorted().map { key in
            "\(formEscape(key))=\(formEscape(fields[key] ?? ""))"
        }.joined(separator: "&")
        return Data(query.utf8)
    }

    private static func formEscape(_ value: String) -> String {
        var allowed = CharacterSet.alphanumerics
        allowed.insert(charactersIn: "-._~")
        return value.addingPercentEncoding(withAllowedCharacters: allowed)?.replacingOccurrences(
            of: "%20",
            with: "+"
        ) ?? ""
    }
}

private func isTrustedHTTPS(_ url: URL) -> Bool {
    url.scheme == "https" && url.host != nil && url.user == nil && url.password == nil
        && url.port == nil && url.query == nil && url.fragment == nil
}

private func isTrustedEndpoint(_ endpoint: URL, issuer: URL) -> Bool {
    isTrustedHTTPS(endpoint) && endpoint.host == issuer.host
}

private final class RejectRedirectsDelegate: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
    func urlSession(
        _ session: URLSession,
        task: URLSessionTask,
        willPerformHTTPRedirection response: HTTPURLResponse,
        newRequest request: URLRequest,
        completionHandler: @escaping (URLRequest?) -> Void
    ) {
        completionHandler(nil)
    }
}
