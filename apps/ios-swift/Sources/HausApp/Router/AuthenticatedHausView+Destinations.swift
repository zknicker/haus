import HausAppModel
import HausModels
import HausUI
import SwiftUI

/// What each route draws, under the shell's own bottom chrome (the system
/// tab bar stays hidden on every screen); a route whose record has not arrived
/// yet stays blank until it does.
extension AuthenticatedHausView {
    func routeDestination(_ route: HausRoute) -> some View {
        routeScreen(route).toolbar(.hidden, for: .tabBar)
    }

    @ViewBuilder
    private func routeScreen(_ route: HausRoute) -> some View {
        switch RouteScreen(route) {
        case .conversation:
            chatRoute(route.conversation.flatMap(destination(for:)))
        case .task(let taskID):
            taskDestination(taskID)
        case .projectSettings(let projectID):
            projectSettingsDestination(projectID)
        case .work(let place):
            workDestination(place)
        case .worker(let workerID):
            workerDestination(workerID)
        case .pullRequest(let reading):
            pullRequestDestination(reading)
        case .driveFolder(let prefix):
            driveFolderDestination(prefix)
        case .driveFile(let path):
            driveFileDestination(path)
        case .none:
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
            workPill: destination.durableChat.flatMap { store.workPill(.chat($0.id), now: .now) },
            onOpenWork: {
                guard let chat = destination.durableChat else { return }
                router.open(.work(.chat(chat.id)))
            },
            history: destination.durableChat.map { store.messageHistory(chatID: $0.id) } ?? .init(),
            mentionOptions: store.mentionOptions(for: destination),
            onLoadMentionOptions: { await store.loadMentionOptions(for: destination) },
            contentInsets: contentInsets,
            scrollTargetMessageID: revealBinding(conversation(for: destination)),
            onVisibleMessagesChange: { reportVisibleMessages(destination, $0) }
        )
        .id(destination.id)
        .task(id: destination.durableChat?.id) {
            guard let chat = destination.durableChat else { return }
            await store.loadWork(.chat(chat.id), includingFiles: false)
        }
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

    /// Stacked, a chat route gives the bottom edge to its composer. Split,
    /// the tab bar belongs to the list pane beside it and stays.
    func revealBinding(_ conversation: HausConversation) -> Binding<String?> {
        Binding(
            get: { router.revealedMessageID(in: conversation) },
            set: { if $0 == nil { router.finishReveal() } }
        )
    }
}
