import CryptoKit
import Foundation
import XCTest
@testable import HausTransport

final class NativeOAuthTests: XCTestCase {
    override func tearDown() {
        StubURLProtocol.requestHandler = nil
        super.tearDown()
    }

    func testNativeLogoutSendsTheServerProvenanceHeader() async throws {
        StubURLProtocol.requestHandler = { request in
            XCTAssertEqual(request.url?.absoluteString, "https://haus.chat/auth/logout")
            XCTAssertEqual(request.httpMethod, "POST")
            XCTAssertEqual(request.value(forHTTPHeaderField: "X-Haus-Session-Request"), "1")
            let body = request.httpBody ?? request.httpBodyStream.flatMap(readBody) ?? Data()
            let fields = try JSONSerialization.jsonObject(with: body) as? [String: String]
            XCTAssertEqual(fields, ["client": "ios", "sessionToken": "resume_fixture"])
            return response(data: Data(), url: request.url)
        }
        let server = NativeAuthServerAPI(
            serverOrigin: URL(string: "https://haus.chat")!,
            session: makeStubSession()
        )
        try await server.logout(resumeToken: "resume_fixture")
    }

    func testPKCEUsesURLSafeS256AndCloudflareCompatibleChallenge() throws {
        let challenge = try NativePKCEChallenge.create()
        let digest = SHA256.hash(data: Data(challenge.verifier.utf8))
        let expected = Data(digest).base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")

        XCTAssertEqual(challenge.challenge, expected)
        XCTAssertEqual(challenge.verifier.count, 43)
        XCTAssertEqual(challenge.challenge.count, 43)
        XCTAssertTrue(challenge.challenge.first?.isASCII == true)
        XCTAssertTrue(challenge.challenge.first?.isLetter == true || challenge.challenge.first?.isNumber == true)
        XCTAssertNil(challenge.verifier.rangeOfCharacter(from: CharacterSet(charactersIn: "+/=")))
    }

    func testOAuthCallbackRequiresExactSchemeHostAndState() throws {
        let callback = try NativeOAuthCallback.code(
            from: URL(string: "haus://sso-callback?code=auth_code&state=state_test")!,
            expectedState: "state_test"
        )
        XCTAssertEqual(callback, "auth_code")

        for url in [
            URL(string: "haus://other?code=auth_code&state=state_test")!,
            URL(string: "haus://sso-callback?code=auth_code&state=wrong")!,
            URL(string: "haus://sso-callback?code=auth_code&state=state_test&state=state_test")!,
            URL(string: "haus://sso-callback/path?code=auth_code&state=state_test")!,
        ] {
            XCTAssertThrowsError(try NativeOAuthCallback.code(from: url, expectedState: "state_test"))
        }
    }

    func testCloudflareCodeExchangeUsesOriginalVerifierAndBrokerRedirectURI() async throws {
        let config = AppAuthConfig(
            clientId: "ios-test-client",
            issuer: nativeAuthTestIssuer,
            redirectUri: nativeAuthTestRedirect,
            resource: nativeAuthTestResource
        )
        StubURLProtocol.requestHandler = { request in
            if request.url?.path == "/.well-known/oauth-authorization-server" {
                XCTAssertEqual(request.httpMethod, "GET")
                return response(data: nativeOAuthMetadataData(), url: request.url)
            }

            XCTAssertEqual(request.url?.absoluteString, "https://thearcade.cloudflareaccess.com/cdn-cgi/access/oauth/token")
            XCTAssertEqual(request.httpMethod, "POST")
            XCTAssertEqual(request.value(forHTTPHeaderField: "content-type"), "application/x-www-form-urlencoded")
            let fields = nativeFormFields(request)
            XCTAssertEqual(fields["client_id"], "ios-test-client")
            XCTAssertEqual(fields["code"], "broker_code")
            XCTAssertEqual(fields["code_verifier"], "original_pkce_verifier")
            XCTAssertEqual(fields["grant_type"], "authorization_code")
            XCTAssertEqual(fields["redirect_uri"], "https://haus.chat/auth/callback")
            XCTAssertEqual(fields["resource"], "https://haus.chat/auth/session")
            XCTAssertNil(fields["client_secret"])
            return response(data: nativeTokenData(), url: request.url)
        }

        let provider = try await CloudflareOAuthClient.discover(config: config, session: makeStubSession())
        let tokens = try await provider.exchange(code: "broker_code", verifier: "original_pkce_verifier")
        XCTAssertEqual(tokens.accessToken, "provider_access_test")
        XCTAssertEqual(tokens.refreshToken, "provider_refresh_test")
        XCTAssertEqual(tokens.expiresIn, 600)
    }

    func testCloudflareMetadataRejectsEndpointsOutsideTheIssuerOrigin() async throws {
        let config = AppAuthConfig(
            clientId: "ios-test-client",
            issuer: nativeAuthTestIssuer,
            redirectUri: nativeAuthTestRedirect,
            resource: nativeAuthTestResource
        )
        StubURLProtocol.requestHandler = { request in
            response(
                data: nativeOAuthMetadataData(tokenEndpoint: "https://attacker.example/token"),
                url: request.url
            )
        }

        do {
            _ = try await CloudflareOAuthClient.discover(config: config, session: makeStubSession())
            XCTFail("Expected metadata with a foreign endpoint to be rejected")
        } catch let error as NativeAuthError {
            XCTAssertEqual(error, .invalidConfiguration)
        }
    }
}
