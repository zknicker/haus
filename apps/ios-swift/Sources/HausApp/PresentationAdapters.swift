import Foundation
import HausModels
import HausUI

extension HausStore {
    /// Reads — and so subscribes the calling view body to — every observable
    /// directory field the projections resolve names, avatars, and presence
    /// from. The memoized projections skip the work, never the observation: a
    /// cached answer has to leave its caller subscribed to exactly what a
    /// rebuilt one would.
    func trackProjectionDirectory() {
        // Presence reaches rows through `availability(for:)`, which only the
        // rebuild path calls.
        _ = lifecycleAvailability.count
        _ = agentsByID
        _ = membersByID
        // Channel references resolve their label and appearance from the Chat
        // list, so a renamed or recolored channel has to reach a drawn row.
        _ = chatsByID
        // Shared artifact chips: the open Server's slug decides which links
        // are library links, and a loaded title retitles a chip.
        syncSharedArtifactScope()
        _ = sharedArtifactRevision
    }

    /// The Agent directory as an index. `HausStore` rebuilds it with the
    /// Agent list, so resolving an author or a mention is a dictionary read
    /// rather than a scan of every Agent per row.
    var agentsByID: [String: AgentSummary] {
        let list = agents
        if let cached = projections.agentsByID { return cached }
        let index = Dictionary(list.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
        projections.agentsByID = index
        return index
    }

    /// The Chat list as an index, resolving a `chat://` reference's live name
    /// and appearance without scanning every Chat per row.
    var chatsByID: [String: ChatSummary] {
        let list = chats
        if let cached = projections.chatsByID { return cached }
        let index = Dictionary(list.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
        projections.chatsByID = index
        return index
    }

    var membersByID: [String: MemberSummary] {
        let list = members?.members ?? []
        if let cached = projections.membersByID { return cached }
        let index = Dictionary(list.map { ($0.userID, $0) }, uniquingKeysWith: { first, _ in first })
        projections.membersByID = index
        return index
    }

    /// The transcript the canvas renders.
    ///
    /// The Chat route calls this on every evaluation — every keyboard inset
    /// change, every engagement tick — so the result is memoized per
    /// Chat. It is rebuilt only when one of its inputs is written: the Chat's
    /// page, its optimistic rows, the Agent and Member directories, and the
    /// lifecycle presence overlay. Each of those is a `HausStore` accessor
    /// whose setter retires this cache, so a stale row is not expressible.
    /// A rebuild reuses each unchanged message's parsed body.
    func messagePresentations(chatID: String) -> [MessagePresentation] {
        trackProjectionDirectory()
        // Task chips wear the state of every Task this client holds; a state
        // change retires the drawn rows, never a parsed body.
        syncTaskReferenceStates()
        let page = messagesByChatID[chatID]
        let pending = pendingMessagesByChatID[chatID] ?? []
        if let cached = projections.messagePresentationsByChatID[chatID] { return cached }

        let rows = durableMessagePresentations(page) + pendingMessagePresentations(pending, page: page)
        projections.messagePresentationsByChatID[chatID] = rows
        return rows
    }

    func durableMessagePresentations(_ page: ChatMessagePage?) -> [MessagePresentation] {
        guard let page else { return [] }
        let tasksByOrigin = TaskPreviewProjection.presentations(page.tasks) { message in
            actorPresentation(agentID: message.authorAgentID, userID: message.authorUserID)
        }
        return page.messages.compactMap { message in
            guard let author = authorPresentation(message.author) else { return nil }
            // Resolved here so the body goes through the parser that knows the
            // Server's Agents and members, and the trimmed string and its
            // segments always describe each other.
            let parsed = parsedBody(
                id: message.id,
                content: message.displayContent,
                chatID: message.chatID,
                taskLinks: message.taskLinks
            )
            // Every linked work draws the same card, wherever the link sits.
            let linkedWork = message.cloudAgentWork
            return MessagePresentation(
                id: message.id,
                author: author,
                content: parsed.body,
                createdAt: message.createdAt,
                attachments: message.attachments.map(attachmentPresentation),
                sequence: message.sequence,
                inlineReply: message.reply.flatMap { reply in
                    replyReferencePresentation(reply.parent)
                },
                claim: message.claim.map(claimPresentation),
                cloudAgents: linkedWork.map(cloudAgentPresentation),
                reactions: reactionPresentations(message.reactions),
                richBlocks: stampedBlocks(parsed),
                visualBody: parsed.visuals,
                cause: message.cause.flatMap(MessageCausePresentation.init),
                tasks: tasksByOrigin[message.id] ?? [],
                workerReport: workerReport(message)
            )
        }
    }

    private func workerReport(_ message: ChatMessage) -> MessageWorkerReport? {
        guard case let .workerReport(workerID, turnID, outcome) = message.body else { return nil }
        let worker = message.cloudAgentWork.first { $0.id == workerID } ?? workers.worker(id: workerID)
        return MessageWorkerReport(workerID: workerID, turnID: turnID, outcome: outcome, worker: worker)
    }

    /// An optimistic row is projected only until the page carries its nonce.
    /// The Store retires it in the same pass the page lands, and both rows carry
    /// the same id once the send receipt has been adopted — so this filter is
    /// what guarantees the transcript shows one row, never the pair.
    private func pendingMessagePresentations(
        _ pending: [PendingChatMessage],
        page: ChatMessagePage?
    ) -> [MessagePresentation] {
        let unsettled = OptimisticMessageRow.unsettled(pending, page: page?.messages ?? [])
        guard !unsettled.isEmpty else { return [] }
        let viewer = viewerAuthorPresentation
        return unsettled.map { message in
            // An optimistic row goes through the same body resolution as a
            // durable one, so its mentions survive the trust check even when
            // trimming changes the string the composer staged.
            let parsed = parsedBody(id: message.id, content: message.content, chatID: message.chatID)
            return MessagePresentation(
                id: message.id,
                author: viewer,
                content: parsed.body,
                createdAt: message.createdAt,
                attachments: message.attachments.map(\.presentation),
                inlineReply: message.inlineReply,
                isPending: true,
                isSendFailed: message.sendState == .failed,
                richBlocks: stampedBlocks(parsed),
                visualBody: parsed.visuals
            )
        }
    }

    private func attachmentPresentation(_ attachment: AttachmentMetadata) -> MessageAttachmentPresentation {
        MessageAttachmentPresentation(
            id: attachment.id,
            filename: attachment.filename,
            mediaType: attachment.mediaType,
            sizeBytes: attachment.sizeBytes
        )
    }

    func claimPresentation(_ claim: MessageClaim) -> ClaimPresentation {
        let status: ClaimStatusPresentation = switch claim.status {
        case .todo: .todo
        case .inProgress: .inProgress
        case .inReview: .inReview
        case .done: .done
        case .closed: .closed
        }
        return ClaimPresentation(
            number: claim.number,
            origin: claim.origin,
            status: status,
            assignee: actorPresentation(agentID: claim.assigneeAgentID, userID: nil),
            creator: actorPresentation(agentID: claim.createdByAgentID, userID: claim.createdByUserID)
        )
    }

    func actorPresentation(
        agentID: String?,
        userID: String?
    ) -> MessageAuthorPresentation? {
        if let agentID {
            let agent = agentsByID[agentID]
            return MessageAuthorPresentation(
                id: agentID,
                name: agent?.displayName ?? "Deleted Captain",
                avatarURL: resolvedAvatarURL(agent?.avatarURL),
                presence: agent.map { presence(availability(for: $0)) },
                kind: .captain
            )
        }
        if let userID {
            let member = membersByID[userID]
            return MessageAuthorPresentation(
                id: userID,
                name: member?.displayName ?? member?.handle ?? "Haus member",
                avatarURL: resolvedAvatarURL(member?.avatarURL)
            )
        }
        return nil
    }

    func authorPresentation(_ author: ChatAuthor) -> MessageAuthorPresentation? {
        switch author {
        case .agent(let agentID, let profile):
            let agent = agentsByID[agentID]
            return MessageAuthorPresentation(
                id: agentID,
                name: agent?.displayName ?? profile?.displayName ?? "Deleted Captain",
                avatarURL: resolvedAvatarURL(agent?.avatarURL ?? profile?.avatarURL),
                presence: agent.map { presence(availability(for: $0)) },
                kind: .captain
            )
        case .human(let profile, let userID):
            let member = membersByID[userID]
            return MessageAuthorPresentation(
                id: userID,
                name: member?.displayName ?? profile?.displayName ?? "Haus member",
                avatarURL: resolvedAvatarURL(member?.avatarURL ?? profile?.avatarURL)
            )
        case .system:
            return nil
        }
    }

    private var viewerAuthorPresentation: MessageAuthorPresentation {
        guard let directory = members,
              let viewer = membersByID[directory.viewerUserID]
        else {
            return MessageAuthorPresentation(id: "viewer", name: "You", avatarURL: nil)
        }

        return MessageAuthorPresentation(
            id: viewer.userID,
            name: viewer.displayName ?? viewer.email ?? "You",
            avatarURL: resolvedAvatarURL(viewer.avatarURL)
        )
    }

}
