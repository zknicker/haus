import Foundation
import HausModels

/// One unread Thread as the Unread section reads it (ADR 0043). The App layer
/// has resolved the parent it hangs off — its mark, and whether it is a
/// Channel — because the row names the place, not the Thread.
public struct InboxUnreadThread: Identifiable, Equatable, Sendable {
    /// The Thread's own Chat.
    public let id: String
    /// The parent Channel's name without the hash; nil for a DM, which the
    /// row labels "DM", never its peer.
    public let channelName: String?
    /// The parent's mark, since the parent is the place the row names.
    public let mark: InboxMark
    public let lastActivityAt: Date?
    /// The newest reply the reader has not read.
    public let latestReply: ChatLastMessage?

    public init(
        id: String,
        channelName: String?,
        mark: InboxMark,
        lastActivityAt: Date?,
        latestReply: ChatLastMessage?
    ) {
        self.id = id
        self.channelName = channelName
        self.mark = mark
        self.lastActivityAt = lastActivityAt
        self.latestReply = latestReply
    }

    func row(viewerDisplayName: String?) -> InboxUnreadRow {
        InboxUnreadRow(
            id: id,
            mark: mark,
            title: channelName.map { "#\($0)" } ?? "DM",
            preview: InboxUnreadThreadPreview.line(latestReply, viewerDisplayName: viewerDisplayName),
            lastActivityAt: lastActivityAt,
            open: .thread(threadChatID: id)
        )
    }
}

/// What a Thread row quotes: who replied, then what they said —
/// `Blippy replied in thread: Done`. The viewer's own reply reads `You`.
public enum InboxUnreadThreadPreview {
    public static func line(_ reply: ChatLastMessage?, viewerDisplayName: String?) -> String {
        guard let reply else { return "New replies in thread" }
        let author = reply.authorDisplayName == viewerDisplayName ? "You" : reply.authorDisplayName
        let content = RichMessageParser.oneLinePreview(reply.content)
        return content.isEmpty ? "\(author) replied in thread" : "\(author) replied in thread: \(content)"
    }
}
