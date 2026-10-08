import Foundation

/// A Thread reference's two ids, read from its wire form
/// `chat://<chatId>?thread=<anchorMessageId>` — the shared contract's
/// `parseChatThreadReferenceTarget`. The Server rewrites an Agent's Thread
/// mentions into this form, and the reference's id stays the wire target, so
/// it carries both ids through every surface that only has room for one string.
public struct ThreadReferenceTarget: Hashable, Sendable {
    /// The conversation the Thread hangs off.
    public let chatID: String
    /// The Message the Thread is anchored on.
    public let anchorMessageID: String

    public init(chatID: String, anchorMessageID: String) {
        self.chatID = chatID
        self.anchorMessageID = anchorMessageID
    }

    /// Nil unless the whole target is exactly the Thread form: one Chat id, a
    /// single `thread` parameter, and nothing after it.
    public init?(wireTarget: String) {
        let prefix = "chat://"
        guard wireTarget.hasPrefix(prefix),
              let marker = wireTarget.range(of: "?thread=")
        else { return nil }
        let rawChat = wireTarget[wireTarget.index(wireTarget.startIndex, offsetBy: prefix.count)..<marker.lowerBound]
        let rawAnchor = wireTarget[marker.upperBound...]
        guard !rawChat.isEmpty, !rawChat.contains("?"),
              !rawAnchor.isEmpty, !rawAnchor.contains(where: { "&?#".contains($0) })
        else { return nil }
        let chatID = Self.decoded(rawChat)
        let anchorMessageID = Self.decoded(rawAnchor)
        guard !chatID.isEmpty, !anchorMessageID.isEmpty else { return nil }
        self.init(chatID: chatID, anchorMessageID: anchorMessageID)
    }

    /// Reads a tapped link back into a Thread, for the text view's coordinator.
    public init?(url: URL) {
        self.init(wireTarget: url.absoluteString)
    }

    /// What a resolved Thread chip says: its anchor's first non-blank line as
    /// a preview, cut at 64 characters — the App's `threadReferenceTitle`.
    public static func title(anchorContent: String) -> String {
        let firstLine = anchorContent
            .split(whereSeparator: \.isNewline)
            .first { !$0.trimmingCharacters(in: .whitespaces).isEmpty }
            .map(String.init) ?? ""
        let line = RichMessageParser.oneLinePreview(firstLine)
        guard !line.isEmpty else { return "Thread" }
        guard line.count > 64 else { return line }
        let cut = line.prefix(63).trimmingCharacters(in: .whitespaces)
        return "\(cut)…"
    }

    private static func decoded(_ value: Substring) -> String {
        String(value).removingPercentEncoding ?? String(value)
    }
}
