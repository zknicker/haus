import HausAppModel
import HausModels
import HausUI
import SwiftUI

/// What each route draws. The tab's content sets the system tab bar's
/// visibility for every screen in it (`AuthenticatedHausView+Tabs.swift`). A
/// route whose record has not arrived yet stays blank until it does.
extension AuthenticatedHausView {
    func routeDestination(_ route: HausRoute) -> some View {
        routeScreen(route)
    }

    @ViewBuilder
    private func routeScreen(_ route: HausRoute) -> some View {
        switch RouteScreen(route) {
        case .conversation:
            chatRoute(route.conversation)
        case .task(let taskID):
            taskDestination(taskID)
        case .projectSettings(let projectID):
            projectSettingsDestination(projectID)
        case .work(let place):
            workDestination(place)
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
    private func chatRoute(_ routeConversation: HausConversation?) -> some View {
        Group {
            if let routeConversation, let destination = destination(for: routeConversation) {
                GeometryReader { proxy in
                    chatScreen(destination, revealing: routeConversation, contentInsets: proxy.safeAreaInsets)
                        .ignoresSafeArea(edges: shellChrome.transcriptIgnoredEdges)
                }
                .ignoresSafeArea(.keyboard)
            } else {
                Color.clear
            }
        }
        .hausHiddenNavigationBar(shellChrome == .custom)
        .background(InteractivePopRestorer())
    }

    private func chatScreen(
        _ destination: ChatDestination,
        revealing routeConversation: HausConversation,
        contentInsets: EdgeInsets
    ) -> some View {
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
            onOpenAgent: { router.open(.captain(agentID: $0)) },
            onCall: callAction(for: destination),
            workPill: destination.durableChat.flatMap { store.workPill(.chat($0.id)) },
            onOpenWork: {
                guard let chat = destination.durableChat else { return }
                router.open(.work(.chat(chat.id)))
            },
            history: destination.durableChat.map { store.messageHistory(chatID: $0.id) } ?? .init(),
            mentionOptions: store.mentionOptions(for: destination),
            onLoadMentionOptions: { await store.loadMentionOptions(for: destination) },
            contentInsets: contentInsets,
            scrollTargetMessageID: revealBinding(routeConversation),
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
        case .implicitCaptainChat(let agent):
            guard attachments.isEmpty else { return false }
            return await store.sendCaptainChat(content, to: agent.id) != .rejected
        }
    }

    private func callAction(for destination: ChatDestination) -> (() -> Void)? {
        guard destination.durableChat != nil, case .captainChat = destination.kind else { return nil }
        return { openAgentCall(destination) }
    }

    func revealBinding(_ conversation: HausConversation) -> Binding<String?> {
        Binding(
            get: { router.revealedMessageID(in: conversation) },
            set: { if $0 == nil { router.finishReveal() } }
        )
    }
}
