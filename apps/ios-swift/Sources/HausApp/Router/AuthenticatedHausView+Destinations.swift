import HausAppModel
import HausModels
import HausUI
import SwiftUI

/// What each route draws. Chat routes hide the tab bar and its accessory so
/// the composer owns the bottom edge; a route whose record has not arrived
/// yet stays blank until it does.
extension AuthenticatedHausView {
    @ViewBuilder
    func routeDestination(_ route: HausRoute) -> some View {
        switch route {
        case .captainDM, .channel, .dm:
            chatRoute(route.conversation.flatMap(destination(for:)))
        case .task(let taskID, _):
            taskDestination(taskID)
                .toolbar(.hidden, for: .tabBar)
        case .projectSettings(let projectID):
            projectSettingsDestination(projectID)
        case .worker, .pullRequest, .work, .driveFile, .settings:
            Color.clear
        }
    }

    @ViewBuilder
    private func chatRoute(_ destination: ChatDestination?) -> some View {
        Group {
            if let destination {
                GeometryReader { proxy in
                    chatScreen(destination, contentInsets: proxy.safeAreaInsets)
                        .ignoresSafeArea()
                }
                .ignoresSafeArea(.keyboard)
            } else {
                Color.clear
            }
        }
        .hausHiddenNavigationBar()
        .toolbar(.hidden, for: .tabBar)
        .background(InteractivePopRestorer())
    }

    private func chatScreen(_ destination: ChatDestination, contentInsets: EdgeInsets) -> some View {
        let composer = ComposerDestination.chat(destination.pendingKey)
        return ChatScreenView(
            chat: destination,
            messages: store.messagePresentations(chatID: destination.pendingKey),
            isMessageHistoryLoaded: destination.durableChat.map { store.hasLoadedMessageHistory(chatID: $0.id) } ?? true,
            draft: store.draftBinding(for: composer),
            composerInteraction: store.composerInteraction(for: composer),
            isConnected: store.isConnected,
            onOpenSidebar: { router.pop() },
            onOpenChatDetails: { router.present(.chatDetails(conversation(for: destination))) },
            onOpenSearch: { router.present(.chatSearch(chatID: destination.durableChat?.id)) },
            onSend: { content, attachments in await send(content, attachments: attachments, to: destination) },
            onSendInlineReply: { content, attachments, reference in
                guard case .durableChat(let chat) = destination else { return false }
                return await store.send(
                    content,
                    to: chat.id,
                    attachments: attachments,
                    replyToMessageID: reference.id,
                    replyPreview: reference
                )
            },
            onOpenAttachment: { try await store.downloadAttachment($0) },
            onOpenAgent: { router.open(.captainDM(agentID: $0)) },
            onCall: callAction(for: destination),
            history: destination.durableChat.map { store.messageHistory(chatID: $0.id) } ?? .init(),
            mentionOptions: store.mentionOptions(for: destination),
            onLoadMentionOptions: { await store.loadMentionOptions(for: destination) },
            contentInsets: contentInsets,
            scrollTargetMessageID: revealBinding(conversation(for: destination)),
            onVisibleMessagesChange: { reportVisibleMessages(destination, $0) }
        )
        .id(destination.id)
    }

    private func send(_ content: String, attachments: [ComposerAttachment], to destination: ChatDestination) async -> Bool {
        switch destination {
        case .durableChat(let chat):
            return await store.send(content, to: chat.id, attachments: attachments)
        case .implicitAgentDM(let agent):
            guard attachments.isEmpty else { return false }
            return await store.sendAgentDM(content, to: agent.id) != .rejected
        }
    }

    private func callAction(for destination: ChatDestination) -> (() -> Void)? {
        guard destination.durableChat != nil, case .agentDirectMessage = destination.kind else { return nil }
        return { openAgentCall(destination) }
    }

    func revealBinding(_ conversation: HausConversation) -> Binding<String?> {
        Binding(
            get: { router.revealedMessageID(in: conversation) },
            set: { if $0 == nil { router.finishReveal() } }
        )
    }
}
