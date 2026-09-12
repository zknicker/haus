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
/// selected, inside the drawer geometry both share.
extension HausShellView {
    @ViewBuilder
    func canvas(proxy: GeometryProxy, drawerWidth: CGFloat) -> some View {
        if let selectedDestination {
            // The drawer's geometry belongs to this container, not
            // to the screen inside it. The screen is keyed by
            // destination, so selecting a Chat replaces it, and a
            // view that did not exist a frame ago has no offset to
            // animate from. The container outlives the swap, so the
            // spring keeps running through it.
            ZStack {
                if showsInbox {
                    // The Inbox is the landing canvas, not a screen pushed over
                    // one: it wears no navigation bar and offers no way back,
                    // because there is nothing behind it to go back to. The
                    // drawer's geometry, veil, and pan below are the canvas's
                    // own, so the page inherits every one of them unchanged.
                    inboxCanvas(proxy.safeAreaInsets, { setDrawer(open: !drawerPresented) })
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    ChatScreenView(
                        chat: selectedDestination,
                        messages: messagesForDestination(selectedDestination),
                        isMessageHistoryLoaded: isMessageHistoryLoaded(selectedDestination),
                        draft: draftBinding(for: selectedDestination),
                        composerInteraction: composerInteraction(for: selectedDestination),
                        isConnected: isConnected,
                        onOpenSidebar: { setDrawer(open: !drawerPresented) },
                        onOpenChatDetails: { activeChatSheet = .details(selectedDestination) },
                        onOpenSearch: { activeChatSheet = .search },
                        onOpenThread: { message in
                            guard let chat = selectedDestination.durableChat else { return }
                            onOpenThread(chat, message)
                        },
                        onSend: { await onSend(selectedDestination, $0, $1) },
                        onOpenAttachment: onOpenAttachment,
                        onOpenAgent: openAgent,
                        hasOlderMessages: selectedDestination.durableChat.map(hasOlderMessages) ?? false,
                        isLoadingOlderMessages: selectedDestination.durableChat.map(isLoadingOlderMessages) ?? false,
                        onLoadOlderMessages: {
                            guard let chat = selectedDestination.durableChat else { return false }
                            return await onLoadOlderMessages(chat)
                        },
                        mentionOptions: mentionOptions(selectedDestination),
                        onLoadMentionOptions: { await loadMentionOptions(selectedDestination) },
                        contentInsets: proxy.safeAreaInsets,
                        scrollTargetMessageID: scrollTargetBinding(for: selectedDestination)
                    )
                    // Each Chat gets its own screen. Reusing one screen carried
                    // the previous Chat's scroll offset and transcript state
                    // into the next one, and left `defaultScrollAnchor(.bottom)`
                    // unapplied; a fresh screen lays out bottom-anchored before
                    // the drawer reveals it.
                    .id(selectedDestination.id)
                    // The drawer's own motion is the transition. The Chat
                    // behind it is already the next one, fully formed, and
                    // `selectDestination` has given it a frame of its own
                    // to land in before the spring starts.
                    .transition(.identity)
                }
            }
            .overlay {
                let progress = drawerProgress(drawerWidth: drawerWidth)
                // The veil leaves by being removed, never by animating to
                // clear: progress is discrete, so it reads zero as soon as
                // the drawer is told to close. Removing it inside the
                // closing spring is the fade an interactive close wants;
                // removing it outside any animation, which is how a Chat
                // selection commits, is the hard cut that keeps the slide
                // the only transition.
                if HausDrawerVeil.isPainted(progress: progress, close: drawerClose) {
                    HausDrawerVeil.color(for: colorScheme)
                        .opacity(HausDrawerVeil.opacity(for: colorScheme, progress: progress))
                        .contentShape(.rect)
                        .allowsHitTesting(drawerPresented)
                        .onTapGesture { setDrawer(open: false) }
                }
            }
            // The veil is shaped and expanded with the canvas it covers,
            // so it carries the same corners and the same full height.
            .clipShape(.rect(cornerRadius: canvasCornerRadius(drawerWidth: drawerWidth)))
            .ignoresSafeArea()
            .shadow(
                color: .black.opacity(0.13 * drawerProgress(drawerWidth: drawerWidth)),
                radius: 20,
                x: -6
            )
            .offset(x: canvasOffset(drawerWidth: drawerWidth))
            .zIndex(2)
            .drawerPan(isOpen: drawerPresented) { pan in
                handleDrawerPan(pan, drawerWidth: drawerWidth)
            }
        }
    }
}
