import Foundation
import HausModels

extension TRPCClient {
    public func voiceCallRequest(serverID: String, chatID: String) async throws -> URLRequest {
        guard var url = URLComponents(
            url: config.serverOrigin.appendingPathComponent("voice/call"), resolvingAgainstBaseURL: false
        ) else { throw TRPCClientError.transport("The call address is invalid.") }
        url.scheme = config.serverOrigin.scheme == "https" ? "wss" : "ws"
        url.queryItems = [URLQueryItem(name: "serverId", value: serverID), URLQueryItem(name: "chatId", value: chatID)]
        guard let address = url.url else { throw TRPCClientError.transport("The call address is invalid.") }
        var request = URLRequest(url: address)
        request.timeoutInterval = 25
        let token = try await sessionTokenProvider.readSessionToken()
        for (header, value) in config.headers(sessionToken: token) {
            request.setValue(value, forHTTPHeaderField: header)
        }
        return request
    }
}
