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
    /// `HausShellView.body` calls this on every evaluation — every frame of a
    /// drawer pan, every keyboard inset change — so the result is memoized per
    /// Chat. It is rebuilt only when one of its inputs is written: the Chat's
    /// page, its optimistic rows, the Agent and Member directories, and the
    /// lifecycle presence overlay. Each of those is a `HausStore` accessor
    /// whose setter retires this cache, so a stale row is not expressible.
    func messagePresentations(chatID: String) -> [MessagePresentation] {
        trackProjectionDirectory()
        let page = messagesByChatID[chatID]
        let pending = pendingMessagesByChatID[chatID] ?? []
        let cloudAgentWork = cloudAgentWorkByChatID[chatID] ?? []
        if let cached = projections.messagePresentationsByChatID[chatID] { return cached }

        let rows = durableMessagePresentations(page, cloudAgentWork: cloudAgentWork) + pendingMessagePresentations(pending, page: page)
        projections.messagePresentationsByChatID[chatID] = rows
        return rows
    }

    func durableMessagePresentations(
        _ page: ChatMessagePage?, cloudAgentWork: [ThreadCloudAgentWork]
    ) -> [MessagePresentation] {
        guard let page else { return [] }
        let threadByAnchor = Dictionary(
            page.threads.map { ($0.anchorMessageID, $0) },
            uniquingKeysWith: { first, _ in first }
        )
        return page.messages.compactMap { message in
            guard let author = authorPresentation(message.author) else { return nil }
            // Task records carry the canonical child Chat created with the task;
            // ordinary messages only gain a child id once a Thread exists.
            let thread = threadByAnchor[message.id].map(threadPresentation)
                ?? message.task.map { task in
                    ThreadPreviewPresentation(
                        threadChatID: task.threadChatID,
                        replyCount: 0,
                        unreadCount: 0,
                        recentReplies: []
                    )
                }
            // Resolved here so the body goes through the parser that knows the
            // Server's Agents and members, and the trimmed string and its
            // segments always describe each other.
            let (body, fenced) = MessagePresentation.resolvedBody(content: message.content)
            return MessagePresentation(
                id: message.id,
                author: author,
                content: body,
                createdAt: message.createdAt,
                attachments: message.attachments.map(attachmentPresentation),
                sequence: message.sequence,
                inlineReply: message.reply.flatMap { reply in
                    replyReferencePresentation(reply.parent)
                },
                thread: thread,
                task: message.task.map(taskPresentation),
                ask: askPresentation(message.body),
                cloudAgents: cloudAgentPresentation(message.body).map { [$0] } ?? [],
                threadCloudAgents: cloudAgentPresentations(cloudAgentWork.filter { $0.anchorMessageId == message.id }),
                richSegments: richMessageSegments(fenced.prose),
                visualBody: fenced
            )
        }
    }

    /// An optimistic row is projected only until the page carries its nonce.
    /// The Store retires it in the same pass the page lands, and both rows carry
    /// the same id once the send receipt has been adopted — so this filter is
    /// what guarantees the transcript shows one row, never the pair.
    private func pendingMessagePresentations(
        _ pending: [PendingChatMessage],
        page: ChatMessagePage?
    ) -> [MessagePresentation] {
        guard !pending.isEmpty else { return [] }
        let durableNonces = OptimisticMessageRow.durableNonces(in: page?.messages ?? [])
        let viewer = viewerAuthorPresentation
        return pending.compactMap { message in
            guard !OptimisticMessageRow.isSuperseded(
                nonce: message.nonce,
                durableNonces: durableNonces
            ) else { return nil }
            // An optimistic row goes through the same body resolution as a
            // durable one, so its mentions survive the trust check even when
            // trimming changes the string the composer staged.
            let (body, fenced) = MessagePresentation.resolvedBody(content: message.content)
            return MessagePresentation(
                id: message.id,
                author: viewer,
                content: body,
                createdAt: message.createdAt,
                attachments: message.attachments.map(\.presentation),
                inlineReply: message.inlineReply,
                isPending: true,
                richSegments: richMessageSegments(fenced.prose),
                visualBody: fenced
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

    private func richMessageSegments(_ content: String) -> [RichMessageSegment] {
        RichMessageParser.parse(content) { kind, id, fallback in
            switch kind {
            case .agent:
                guard let agent = agentsByID[id] else { return nil }
                return RichReferencePresentation(
                    id: id, kind: .agent,
                    label: ReferenceLabel.display(agent.displayName, kind: .agent),
                    avatarURL: resolvedAvatarURL(agent.avatarURL)
                )
            case .human:
                guard let member = membersByID[id] else { return nil }
                let name = member.displayName ?? member.handle ?? fallback
                return RichReferencePresentation(
                    id: id, kind: .human,
                    label: ReferenceLabel.display(name, kind: .human),
                    avatarURL: resolvedAvatarURL(member.avatarURL)
                )
            case .channel:
                guard let chat = chatsByID[id], let name = chat.name else { return nil }
                return RichReferencePresentation(
                    id: id,
                    kind: .channel,
                    label: ReferenceLabel.display(name, kind: .channel),
                    avatarURL: nil,
                    channelAppearance: ChannelAppearance(icon: chat.icon, color: chat.color)
                )
            // No other kind names Server state, so the parser's own chip stands.
            default: return nil
            }
        }
    }

    /// Projects a task-list row back into the shared message presentation used
    /// by the Chat-owned Thread route. Tasks are canonical messages, so the
    /// list lens must not invent a second thread presentation.
    func taskMessagePresentation(_ item: TaskListItem) -> MessagePresentation? {
        guard let author = authorPresentation(item.message.author) else { return nil }
        return MessagePresentation(
            id: item.message.id,
            author: author,
            content: item.message.content,
            createdAt: item.message.createdAt,
            sequence: item.message.sequence,
            thread: threadPresentation(item.threadSummary),
            task: taskPresentation(item.task)
        )
    }

    private func threadPresentation(_ thread: ThreadSummary) -> ThreadPreviewPresentation {
        ThreadPreviewProjection.presentation(for: thread) { reply in
            actorPresentation(agentID: reply.authorAgentID, userID: reply.authorUserID)
        }
    }

    private func taskPresentation(_ task: MessageTask) -> TaskPresentation {
        let status: TaskStatusPresentation = switch task.status {
        case .todo: .todo
        case .inProgress: .inProgress
        case .inReview: .inReview
        case .done: .done
        case .closed: .closed
        }
        return TaskPresentation(
            number: task.number,
            origin: task.origin,
            status: status,
            assignee: actorPresentation(agentID: task.assigneeAgentID, userID: task.assigneeUserID),
            creator: actorPresentation(agentID: task.createdByAgentID, userID: task.createdByUserID)
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
                name: agent?.displayName ?? "Deleted agent",
                avatarURL: resolvedAvatarURL(agent?.avatarURL),
                presence: agent.map { presence(availability(for: $0)) }
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
                name: agent?.displayName ?? profile?.displayName ?? "Deleted agent",
                avatarURL: resolvedAvatarURL(agent?.avatarURL ?? profile?.avatarURL),
                presence: agent.map { presence(availability(for: $0)) }
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
