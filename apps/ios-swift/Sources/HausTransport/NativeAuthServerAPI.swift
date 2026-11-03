import Foundation

struct NativeAuthSessionRequest: Encodable {
    let client = "ios"
    let sessionToken: String?
}

struct NativeAuthServerError: Decodable {
    let error: String
    let message: String
}

struct NativeAuthServerAPI: Sendable {
    let serverOrigin: URL
    let session: URLSession

    func loadConfig() async throws -> AppAuthConfig {
        var request = URLRequest(url: endpoint("auth/config"))
        request.httpMethod = "GET"
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        let (data, response) = try await NativeAuthHTTP.send(request, using: session)
        try requireSuccess(response, body: data)
        guard let config = try? JSONDecoder().decode(AppAuthConfig.self, from: data) else {
            throw NativeAuthError.invalidResponse
        }
        return config
    }

    func createSession(accessToken: String, resumeToken: String?) async throws -> NativeAppSession {
        var request = URLRequest(url: endpoint("auth/session"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        request.httpBody = try encode(NativeAuthSessionRequest(sessionToken: resumeToken))
        return try await decodeSession(request)
    }

    func createDevelopmentSession(resumeToken: String?) async throws -> NativeAppSession {
        var request = URLRequest(url: endpoint("auth/dev/session"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.httpBody = try encode(NativeAuthSessionRequest(sessionToken: resumeToken))
        return try await decodeSession(request)
    }

    func logout(resumeToken: String) async throws {
        var request = URLRequest(url: endpoint("auth/logout"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("1", forHTTPHeaderField: "X-Haus-Session-Request")
        request.httpBody = try encode(NativeAuthSessionRequest(sessionToken: resumeToken))
        let (_, response) = try await NativeAuthHTTP.send(request, using: session)
        guard (200..<300).contains(response.statusCode) else {
            throw NativeAuthError.serverUnavailable
        }
    }

    private func decodeSession(_ request: URLRequest) async throws -> NativeAppSession {
        let (data, response) = try await NativeAuthHTTP.send(request, using: session)
        try requireSuccess(response, body: data)
        guard let result = try? JSONDecoder().decode(NativeAppSession.self, from: data),
              !result.session.accessToken.isEmpty,
              !result.sessionToken.isEmpty,
              result.session.expirationDate != nil,
              result.resumeExpirationDate != nil
        else { throw NativeAuthError.invalidResponse }
        return result
    }

    private func requireSuccess(_ response: HTTPURLResponse, body: Data) throws {
        guard (200..<300).contains(response.statusCode) else {
            if let error = try? JSONDecoder().decode(NativeAuthServerError.self, from: body) {
                switch error.error {
                case "auth_required", "auth_expired":
                    throw NativeAuthError.sessionRequired
                case "auth_revoked", "auth_invalid_grant":
                    throw NativeAuthError.invalidGrant
                case "auth_unavailable":
                    throw NativeAuthError.serverUnavailable
                default:
                    break
                }
            }
            if response.statusCode == 403 { throw NativeAuthError.accountNotAllowed }
            if response.statusCode == 401 { throw NativeAuthError.sessionRequired }
            throw NativeAuthError.serverUnavailable
        }
        guard !body.isEmpty else { throw NativeAuthError.invalidResponse }
    }

    private func endpoint(_ path: String) -> URL {
        path.split(separator: "/").reduce(serverOrigin) { url, component in
            url.appendingPathComponent(String(component), isDirectory: false)
        }
    }

    private func encode<Value: Encodable>(_ value: Value) throws -> Data {
        do {
            return try JSONEncoder().encode(value)
        } catch {
            throw NativeAuthError.invalidResponse
        }
    }
}
