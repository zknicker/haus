import HausModels
import HausUI

extension HausStore {
    /// Every Chat the sidebar can open, in one memoized list.
    ///
    /// Rebuilt only when the Chat list, its receipt-backed Agent DMs, or the
    /// directories are written — each of those is a `HausStore` accessor
    /// whose setter retires this cache.
    var chatDestinations: [ChatDestination] {
        trackProjectionDirectory()
        let chats = chats
        let receiptBackedAgentDMs = receiptBackedAgentDMsByChatID
        let order = sidebarOrder
        if let cached = projections.chatDestinations { return cached }

        let destinations = order.apply(
            buildChatDestinations(chats: chats, receiptBackedAgentDMs: receiptBackedAgentDMs),
            id: \.id
        )
        projections.chatDestinations = destinations
        return destinations
    }

    /// Freezes the sidebar's row order at the live order. Rows keep updating
    /// their unread counts, names, and presence, but a Chat that gains a
    /// message does not move until the order is held again or released.
    ///
    /// The shell calls this as the drawer opens — animating the change, since
    /// it adopts any reordering that happened while the drawer was shut — and
    /// `releaseSidebarOrder()` as it closes.
    func holdSidebarOrder() {
        sidebarOrder.hold(
            buildChatDestinations(chats: chats, receiptBackedAgentDMs: receiptBackedAgentDMsByChatID).map(\.id)
        )
    }

    func releaseSidebarOrder() {
        sidebarOrder.release()
    }

    private func buildChatDestinations(
        chats: [ChatSummary],
        receiptBackedAgentDMs: [String: String]
    ) -> [ChatDestination] {
        let durable = chats.compactMap(durableChatDestination)
        let listedChatIDs = Set(chats.map(\.id))
        // A Dictionary has no order of its own, so this slice is sorted into the
        // Agent list's order — the same order the implicit slice below follows —
        // with the Chat id breaking ties. Iterating the Dictionary directly
        // reshuffled these rows between renders.
        let agentPositions = Dictionary(
            agents.enumerated().map { ($0.element.id, $0.offset) },
            uniquingKeysWith: { first, _ in first }
        )
        let receiptBacked: [ChatDestination] = receiptBackedAgentDMs
            .sorted { left, right in
                (agentPositions[left.value] ?? .max, left.key)
                    < (agentPositions[right.value] ?? .max, right.key)
            }
            .compactMap { chatID, agentID in
                guard !listedChatIDs.contains(chatID),
                      let agent = agentsByID[agentID] else { return nil }
                return ChatDestination.durableChat(ChatPresentation(
                    id: chatID,
                    title: agent.displayName,
                    kind: .agentDirectMessage(agentPresentation(agent))
                ))
            }
        let materializedAgentIDs = Set(
            chats.compactMap(\.peerAgentID) + receiptBackedAgentDMs.values
        )
        let implicit = agents
            .filter { !materializedAgentIDs.contains($0.id) }
            .map { ChatDestination.implicitAgentDM(agentPresentation($0)) }
        return durable + receiptBacked + implicit
    }

    private func durableChatDestination(_ chat: ChatSummary) -> ChatDestination? {
        switch chat.kind {
        case .channel:
            return .durableChat(ChatPresentation(
                id: chat.id,
                title: chat.name ?? (chat.isAll ? "all" : "Channel"),
                kind: .channel,
                unreadCount: chat.unreadCount,
                appearance: ChannelAppearance(icon: chat.icon, color: chat.color)
            ))
        case .dm:
            if let agentID = chat.peerAgentID {
                let agent = agentsByID[agentID]
                let name = agent?.displayName ?? chat.peerAgentDisplayName ?? "Former Agent"
                let presentation = agent.map(agentPresentation)
                    ?? AgentPresentation(id: agentID, name: name, avatarURL: nil, presence: .offline)
                return .durableChat(ChatPresentation(
                    id: chat.id,
                    title: name,
                    kind: .agentDirectMessage(presentation),
                    unreadCount: chat.unreadCount
                ))
            }
            if let userID = chat.peerUserID {
                let member = membersByID[userID]
                let name = member?.displayName ?? member?.handle ?? member?.email ?? "Former member"
                return .durableChat(ChatPresentation(
                    id: chat.id,
                    title: name,
                    kind: .humanDirectMessage(HumanPresentation(
                        id: userID,
                        name: name,
                        handle: member?.handle,
                        avatarURL: resolvedAvatarURL(member?.avatarURL)
                    )),
                    unreadCount: chat.unreadCount
                ))
            }
            return nil
        }
    }

    private func agentPresentation(_ agent: AgentSummary) -> AgentPresentation {
        AgentPresentation(
            id: agent.id,
            name: agent.displayName,
            avatarURL: resolvedAvatarURL(agent.avatarURL),
            presence: presence(availability(for: agent))
        )
    }

    /// Chat details pushes a read-only Agent profile, so it needs the Server
    /// facts a ChatDestination does not carry. Sourced from the live Agent
    /// directory, not `settingsData`, which stays nil until the member
    /// directory loads and would blank the profile on a cold open. Keep the
    /// field derivations in step with `SettingsAgent`.
    func agentProfilePresentation(agentID: String) -> AgentProfilePresentation? {
        guard let agent = agentsByID[agentID] else { return nil }
        let runtime = settingsRuntimeDisplayName(agent.effectiveRuntimeID ?? agent.desiredRuntimeID)
        return AgentProfilePresentation(
            handle: agent.handle,
            description: agent.description ?? "",
            runtime: runtime,
            model: agent.effectiveModelID ?? agent.desiredModelID,
            wakePause: agent.wakePause.map {
                AgentWakePauseCopy.presentation(agentName: agent.displayName, runtimeLabel: runtime, wakePause: $0)
            }
        )
    }
}
