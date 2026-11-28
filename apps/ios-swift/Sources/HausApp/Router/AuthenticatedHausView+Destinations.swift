import HausAppModel
import HausModels
import HausUI
import SwiftUI

/// What each route draws. The tab's content sets the system tab bar's
/// visibility for every screen in it (`AuthenticatedHausView+Tabs.swift`). A
/// route whose record has not arrived yet stays blank until it does.
extension AuthenticatedHausView {
    /// `besideTaskID`: the Task beside this conversation, which its composer
    /// sends to until the chip is let go.
    func routeDestination(_ route: HausRoute, besideTaskID: String? = nil) -> some View {
        routeScreen(route, besideTaskID: besideTaskID)
    }

    @ViewBuilder
    private func routeScreen(_ route: HausRoute, besideTaskID: String?) -> some View {
        switch RouteScreen(route) {
        case .conversation:
            chatRoute(route.conversation, besideTaskID: besideTaskID)
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
        case .settings(let settings):
            settingsDestination(settings)
        }
    }

    @ViewBuilder
    private func chatRoute(_ routeConversation: HausConversation?, besideTaskID: String?) -> some View {
        Group {
            if let routeConversation, let destination = destination(for: routeConversation) {
                GeometryReader { proxy in
                    chatScreen(
                        destination,
                        revealing: routeConversation,
                        besideTaskID: besideTaskID,
                        contentInsets: proxy.safeAreaInsets
                    )
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
        besideTaskID: String?,
        contentInsets: EdgeInsets
    ) -> some View {
        let conversationComposer = ComposerDestination.chat(destination.pendingKey)
        let composer = store.composerTarget(conversationComposer, beside: besideTaskID)
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
            onSend: { content, attachments in
                guard case .task(let taskID) = composer else {
                    return await send(content, attachments: attachments, to: destination)
                }
                guard let chatID = store.taskChatID(taskID: taskID) else { return false }
                return await store.send(content, to: chatID, attachments: attachments)
            },
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
            composerTask: composerTaskChip(composer),
            onClearComposerTask: {
                guard let besideTaskID else { return }
                store.releaseComposerTarget(conversationComposer, from: besideTaskID)
            },
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

    private func composerTaskChip(_ composer: ComposerDestination) -> ComposerTaskChip? {
        guard case .task(let taskID) = composer, let header = store.taskChatHeader(taskID: taskID) else { return nil }
        return ComposerTaskChip(title: header.title, disc: header.disc)
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
