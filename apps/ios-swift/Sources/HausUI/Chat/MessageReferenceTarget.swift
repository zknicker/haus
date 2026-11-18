import Foundation

/// A reference to one Message in a Channel or DM, read from the legacy wire
/// form `chat://<chatId>?thread=<messageId>` the Server once wrote for an
/// Agent's mention of a side conversation. There are no side conversations any
/// more (ADR 0053): the Message they hung off is still in its Channel, with
/// the conversation as inline replies under it, so the chip opens there and
/// keeps the link's own words. The reference's id stays the wire target, so it
/// carries both ids through every surface that only has room for one string.
public struct MessageReferenceTarget: Hashable, Sendable {
    /// The Channel or DM the Message sits in.
    public let chatID: String
    public let messageID: String

    public init(chatID: String, messageID: String) {
        self.chatID = chatID
        self.messageID = messageID
    }

    /// Nil unless the whole target is exactly the legacy form: one Chat id, a
    /// single message parameter, and nothing after it.
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

    /// Reads a tapped link back into a Message, for the text view's coordinator.
    public init?(url: URL) {
        self.init(wireTarget: url.absoluteString)
    }

    /// The query key of the shared contract's legacy form
    /// (`formatChatThreadReferenceTarget` in `packages/haus-api`), kept only so
    /// stored bodies still open their Message.
    static let legacyMessageParameter = "?thread="

    private static func decoded(_ value: Substring) -> String {
        String(value).removingPercentEncoding ?? String(value)
    }
}
