import Foundation

public struct MessageReferenceTarget: Hashable, Sendable {
    public let chatID: String
    public let messageID: String

    public init(chatID: String, messageID: String) {
        self.chatID = chatID
        self.messageID = messageID
    }

    public init?(wireTarget: String) {
        let prefix = "chat://"
        guard wireTarget.hasPrefix(prefix),
              let marker = wireTarget.range(of: Self.legacyMessageParameter)
        else { return nil }
        let rawChat = wireTarget[wireTarget.index(wireTarget.startIndex, offsetBy: prefix.count)..<marker.lowerBound]
        let rawMessage = wireTarget[marker.upperBound...]
        guard !rawChat.isEmpty, !rawChat.contains("?"),
              !rawMessage.isEmpty, !rawMessage.contains(where: { "&?#".contains($0) })
        else { return nil }
        let chatID = Self.decoded(rawChat)
        let messageID = Self.decoded(rawMessage)
        guard !chatID.isEmpty, !messageID.isEmpty else { return nil }
        self.init(chatID: chatID, messageID: messageID)
    }

    public init?(url: URL) {
        self.init(wireTarget: url.absoluteString)
    }

    static let legacyMessageParameter = "?thread="

    private static func decoded(_ value: Substring) -> String {
        String(value).removingPercentEncoding ?? String(value)
    }
}
