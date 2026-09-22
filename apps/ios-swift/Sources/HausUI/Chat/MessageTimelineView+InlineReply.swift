import SwiftUI

enum MessageHistoryRevealTarget: Equatable {
    case message(String)
    case latest
}

extension MessageTimelineView {
    var historyRevealErrorPresented: Binding<Bool> {
        Binding(get: { historyRevealError != nil }, set: { if !$0 { historyRevealError = nil } })
    }

    func requestInlineReply(_ reference: MessageReplyReferencePresentation) {
        requestHistoryReveal(.message(reference.id))
    }

    func requestHistoryReveal(_ target: MessageHistoryRevealTarget) {
        historyRevealError = nil
        historyRevealTarget = target
        historyRevealAttempt += 1
    }

    func resolveHistoryReveal() async {
        guard historyRevealAttempt > 0, !Task.isCancelled, let target = historyRevealTarget else { return }
        let messageID: String?
        let animated: Bool
        switch target {
        case .message(let id):
            if messages.contains(where: { $0.id == id }) {
                messageID = id
                animated = true
            } else {
                messageID = await history.loadAround(id) ? id : nil
                animated = false
            }
        case .latest:
            if history.hasNewer {
                messageID = await history.loadLatest()
                animated = false
            } else {
                messageID = messages.last?.id
                animated = true
            }
        }
        guard !Task.isCancelled, historyRevealTarget == target else { return }
        guard let messageID else {
            historyRevealError = "This message could not be loaded. Check your connection and try again."
            return
        }
        historyRevealTarget = nil
        scrollTargetMessageID = nil
        reveal = TranscriptReveal(token: UUID(), id: messageID, animated: animated)
        if case .message = target { highlightedMessageID = messageID }
    }
}
