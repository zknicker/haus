import Foundation
import HausModels
import HausUI

/// Thread reference chips: what one says, and the Thread it opens.
extension HausStore {
    /// A Thread chip names its anchor's first line once the parent page holds
    /// the anchor; until then the persisted link text stands.
    func threadReferencePresentation(wireTarget: String) -> RichReferencePresentation? {
        guard let thread = ThreadReferenceTarget(wireTarget: wireTarget),
              let anchor = messagesByChatID[thread.chatID]?.messages
                  .first(where: { $0.id == thread.anchorMessageID })
        else { return nil }
        return RichReferencePresentation(
            id: wireTarget,
            kind: .thread,
            label: ThreadReferenceTarget.title(anchorContent: anchor.content),
            avatarURL: nil
        )
    }

    /// The Thread a chip opens. A loaded parent page supplies the projected
    /// anchor with its Thread summary; otherwise the anchor is read on its own
    /// and the Thread's Chat resolves once the screen loads it.
    func threadSelection(for reference: ThreadReferenceTarget) async -> ThreadSelection? {
        if let anchor = messagePresentations(chatID: reference.chatID)
            .first(where: { $0.id == reference.anchorMessageID }) {
            return ThreadSelection(
                parentChatID: reference.chatID,
                threadChatID: anchor.thread?.threadChatID,
                anchor: anchor
            )
        }
        guard let message = await fetchMessage(chatID: reference.chatID, messageID: reference.anchorMessageID)
        else { return nil }
        return threadSelection(conversationChatID: reference.chatID, threadChatID: nil, anchor: message)
    }
}
