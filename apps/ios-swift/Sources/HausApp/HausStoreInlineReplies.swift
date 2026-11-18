import HausModels
import HausUI

extension HausStore {
    /// Drops filtered lists when the active Server changes. In-flight requests
    /// keep their marker until they finish; their generation check prevents an
    /// old response from repopulating the new Server's cache.
    func resetInlineReplyCache() {
        historyNavigation = ChatHistoryNavigationState()
        historyLoadsInFlight.removeAll()
        inlineReplyCacheGeneration += 1
        publishTranscripts(transcripts.removeLists { $0.replyRootMessageID != nil })
        inlineReplyChatIDByRootID.removeAll()
    }

    func replyReferencePresentation(
        _ reference: ChatMessageReplyReference
    ) -> MessageReplyReferencePresentation? {
        guard let author = authorPresentation(reference.author) else { return nil }
        return MessageReplyReferencePresentation(
            id: reference.id,
            author: author,
            content: reference.content,
            createdAt: reference.createdAt,
            sequence: reference.sequence
        )
    }
}
