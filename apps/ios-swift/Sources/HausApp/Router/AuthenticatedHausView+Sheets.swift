import HausAppModel
import HausModels
import HausUI
import SwiftUI

/// The router's one sheet.
extension AuthenticatedHausView {
    @ViewBuilder
    func routerSheet(_ sheet: HausSheet) -> some View {
        switch sheet {
        case .askAnything:
            askAnythingCard
        case .newProject:
            NewChannelFormView(
                create: { [store] draft in try await store.createNativeChannel(draft) },
                onCreated: { router.open(.channel(chatID: $0.id), from: .outside) }
            )
        case .newCaptain:
            NewCaptainFormView(
                projects: askProjects,
                devices: (store.computers ?? []).map { AskAnythingChoice(id: $0.id, name: $0.name ?? "Device") },
                runtimes: (store.modelConnections?.runtimeCatalog ?? []).map(SettingsRuntime.init),
                create: { draft in try await createCaptain(draft) }
            )
            .task { await loadAskChoices() }
        case .archivedProjects:
            ArchivedChannelsView(
                load: { [store] in
                    guard let serverID = await store.activeServer?.id else { throw HausStoreError.serverUnavailable }
                    return try await store.archivedChannelPresentations(serverID: serverID)
                },
                restore: { [store] channel in
                    guard let serverID = await store.activeServer?.id else { throw HausStoreError.serverUnavailable }
                    _ = try await store.unarchiveChannel(chatID: channel.id, serverID: serverID)
                },
                onRestored: { router.open(.channel(chatID: $0.id), from: .outside) }
            )
        case .chatDetails(let conversation):
            if let destination = destination(for: conversation), let server = store.serverPresentation {
                ChatDetailsView(
                    chat: destination,
                    server: server,
                    currentActivity: currentActivity(for: destination),
                    loadAgentActivity: { [store] agentID in try await store.agentActivityPresentations(agentID: agentID) },
                    agentProfile: { store.agentProfilePresentation(agentID: $0) },
                    onOpenAgentProfile: { router.open(.settings(.agent(id: $0)), from: .outside) },
                    stoppedClaims: store.agentStoppedClaims { openClaim($0) }
                )
            }
        case .chatSearch(let chatID):
            SearchTabView(
                chats: store.chatDestinations.compactMap(\.durableChat),
                scopeChat: chatID.flatMap { id in store.chatDestinations.first { $0.id == .chat(id) }?.durableChat },
                searchMessages: { query, chatID in try await store.searchMessagePresentations(query: query, chatID: chatID) },
                searchRecoveryRevision: store.messageSearchRevision,
                isTabRoot: false,
                onSelectChat: { router.open(route(forChatID: $0.id)) },
                onSelectMessage: { router.open(route(forChatID: $0.chatID, messageID: $0.id)) }
            )
        }
    }

    private func currentActivity(for destination: ChatDestination) -> AgentActivityPresentation? {
        guard case .captainChat(let agent) = destination.kind else { return nil }
        return store.currentActivityPresentation(agentID: agent.id)
    }

    /// `agent.create` needs a home Project and a Device; the form only offers
    /// Create once it has both.
    private func createCaptain(_ draft: NewCaptainDraft) async throws {
        guard let serverID = store.activeServer?.id else { throw HausStoreError.serverUnavailable }
        guard let input = CreateAgentInput(
            computerID: draft.deviceID,
            displayName: draft.name,
            handle: draft.handle,
            homeProjectID: draft.projectID,
            modelID: draft.modelID,
            runtimeID: draft.runtimeID,
            serverID: serverID
        ) else { throw HausStoreError.serverUnavailable }
        _ = try await store.client.call(AgentProcedures.create, input)
        try await store.reloadAgents(serverID: serverID)
    }
}
