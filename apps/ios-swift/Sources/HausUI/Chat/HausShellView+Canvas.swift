import SwiftUI

/// Canvas state the shell holds per destination. The canvas is keyed by the
/// selected destination, so anything that has to outlive a Chat switch — a
/// half-typed draft, a pending reveal — is owned here and reaches the screen as
/// a binding.
extension HausShellView {
    /// The composer state that owns the staged attachments for one destination,
    /// created the first time that Chat is drawn. The screen only borrows it, so
    /// picking a photo and switching Chats keeps the photo staged where it was
    /// picked.
    func composerInteraction(for destination: ChatDestination) -> ComposerInteraction {
        composerInteractions.interaction(for: destination.id)
    }

    /// A destination that has left the list can never be returned to, so its
    /// canvas state goes with it — including the staged files, which are deleted
    /// together with the attachments that reference them.
    func dropCanvasState(outside destinationIDs: [ChatDestination.ID]) {
        guard !destinationIDs.isEmpty else { return }
        let live = Set(destinationIDs)
        drafts = drafts.filter { live.contains($0.key) }
        composerInteractions.dropInteractions(outside: destinationIDs)
    }

    func draftBinding(for destination: ChatDestination) -> Binding<String> {
        Binding(
            get: { drafts[destination.id] ?? "" },
            set: { drafts[destination.id] = $0.isEmpty ? nil : $0 }
        )
    }

    func scrollTargetBinding(for destination: ChatDestination) -> Binding<String?> {
        Binding(
            get: {
                guard case .chat(let chatID) = destination.id else { return nil }
                return scrollTarget?.chatID == chatID ? scrollTarget?.messageID : nil
            },
            set: { if $0 == nil { scrollTarget = nil } }
        )
    }
}

/// What the canvas draws: the Inbox the app lands on, or the Chat the reader
/// selected. The drawer's geometry, veil, and pan belong to the UIKit
/// container hosting this view (`HausDrawerContainer`), which outlives every
/// swap below, so a Chat that mounts mid-slide travels with the canvas.
extension HausShellView {
    @ViewBuilder
    func canvas(contentInsets: EdgeInsets) -> some View {
        if let selectedDestination {
            if showsInbox {
                // The Inbox is the landing canvas, not a screen pushed over
                // one: it wears no navigation bar and offers no way back,
                // because there is nothing behind it to go back to.
                inboxCanvas(contentInsets, { [drawer] in drawer.toggle() })
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                chatScreen(selectedDestination, contentInsets: contentInsets)
                    // Each Chat gets its own screen. Reusing one screen
                    // carried the previous Chat's scroll offset and transcript
                    // state into the next one; a fresh screen lays out
                    // bottom-anchored before the drawer reveals it.
                    .id(selectedDestination.id)
                    // The drawer's own motion is the transition.
                    .transition(.identity)
            }
        }
    }

    /// Built by the shell body only, never by a pan frame: the drawer state is
    /// read inside the closures at call time, not while the screen is built.
    private func chatScreen(_ destination: ChatDestination, contentInsets: EdgeInsets) -> some View {
        ChatScreenView(
            chat: destination,
            messages: messagesForDestination(destination),
            isMessageHistoryLoaded: isMessageHistoryLoaded(destination),
            draft: draftBinding(for: destination),
            composerInteraction: composerInteraction(for: destination),
            isConnected: isConnected,
            onOpenSidebar: { [drawer] in drawer.toggle() },
            onOpenChatDetails: { activeChatSheet = .details(destination) },
            onOpenSearch: { activeChatSheet = .search(scope: destination.durableChat) },
            onOpenThread: { message in
                guard let chat = destination.durableChat else { return }
                onOpenThread(chat, message)
            },
            onSend: { await onSend(destination, $0, $1) },
            onSendInlineReply: inlineReplySender(for: destination),
            onOpenAttachment: onOpenAttachment,
            onOpenAgent: openAgent,
            onCall: callAction(for: destination),
            history: destination.durableChat.map(messageHistory) ?? .init(),
            mentionOptions: mentionOptions(destination),
            onLoadMentionOptions: { await loadMentionOptions(destination) },
            contentInsets: contentInsets,
            scrollTargetMessageID: scrollTargetBinding(for: destination),
            onVisibleMessagesChange: { onVisibleMessages(destination, $0) }
        )
    }

    private func inlineReplySender(
        for destination: ChatDestination
    ) -> ((String, [ComposerAttachment], MessageReplyReferencePresentation) async -> Bool)? {
        guard let onSendInlineReply else { return nil }
        return { content, attachments, reference in
            await onSendInlineReply(destination, content, attachments, reference)
        }
    }

    private func callAction(for destination: ChatDestination) -> (() -> Void)? {
        guard destination.durableChat != nil,
              case .agentDirectMessage = destination.kind,
              let onCallAgent else { return nil }
        return { onCallAgent(destination) }
    }
}
