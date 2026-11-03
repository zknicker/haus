import SwiftUI

extension ThreadDetailView {
    /// A Thread over a fixed reply list, for previews and tests.
    public init(
        anchor: MessagePresentation,
        replies: [MessagePresentation],
        isConnected: Bool = true,
        isReadOnly: Bool = false,
        onSend: @escaping (String, [ComposerAttachment]) async -> Bool,
        onOpenAttachment: @escaping (MessageAttachmentPresentation) async throws -> URL = { attachment in
            guard let localURL = attachment.localURL else { throw CancellationError() }
            return localURL
        },
        history: MessageHistoryNavigation = .init(),
        inlineReplies: ThreadInlineReplies? = nil,
        onOpenAgent: @escaping (String) -> Void = { _ in },
        follow: ThreadFollow? = nil,
        contextLabel: String? = nil,
        engagementChatID: String? = nil,
        engagementStyle: HeaderEngagementStyle = .roster,
        onVisibleMessagesChange: @escaping ([String]) -> Void = { _ in }
    ) {
        self.init(
            anchor: anchor,
            replies: { replies },
            isConnected: isConnected,
            isReadOnly: isReadOnly,
            onSend: onSend,
            onOpenAttachment: onOpenAttachment,
            history: history,
            inlineReplies: inlineReplies,
            onOpenAgent: onOpenAgent,
            follow: follow,
            contextLabel: contextLabel,
            engagementChatID: engagementChatID,
            engagementStyle: engagementStyle,
            onVisibleMessagesChange: onVisibleMessagesChange
        )
    }
}
