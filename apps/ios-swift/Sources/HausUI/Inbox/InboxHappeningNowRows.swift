import Foundation
import HausModels

/// One Agent in a turn, as the App layer's activity snapshot reports it.
public struct InboxWorkingAgent: Identifiable, Hashable, Sendable {
    public let id: String
    public let name: String
    public let avatarURL: URL?
    public let presence: AgentPresence?
    /// The step it is on — `Editing files…`.
    public let step: String
    public let occurredAt: Date

    public init(
        id: String,
        name: String,
        avatarURL: URL?,
        presence: AgentPresence?,
        step: String,
        occurredAt: Date
    ) {
        self.id = id
        self.name = name
        self.avatarURL = avatarURL
        self.presence = presence
        self.step = step
        self.occurredAt = occurredAt
    }
}

/// Work running right now, whether or not this human started it.
///
/// Cloud Agent work leads, because it outlives the turn that delegated it: an
/// Agent below may be between turns while the work it started keeps going.
/// Both rows state elapsed time, which is what separates working from stuck.
public enum InboxHappeningNowRows {
    /// Nil until the Cloud Agent work read lands: the Agent activity snapshot
    /// arrives with the Server snapshot, so the work list is the one half that
    /// can still be unknown, and a half-answered section would claim nothing is
    /// running when something is.
    public static func rows(
        work: [ActiveCloudAgentWork]?,
        agents: [InboxWorkingAgent],
        now: Date,
        resolveActor: InboxActorResolver
    ) -> [InboxHappeningNowRow]? {
        guard let work else { return nil }
        return work.map { workRow($0, now: now, resolveActor: resolveActor) }
            + agents.map { agentRow($0, now: now) }
    }

    static func workRow(
        _ item: ActiveCloudAgentWork,
        now: Date,
        resolveActor: InboxActorResolver
    ) -> InboxHappeningNowRow {
        let name = resolveActor(item.work.agentId, nil)?.name
            ?? InboxNeedsYouRows.authoredAgentName(item.message.author, agentID: item.work.agentId)
        let chatLabel = InboxConversationLabel.text(kind: item.chatKind, name: item.chatName)
        return InboxHappeningNowRow(
            id: "work:\(item.work.messageId)",
            mark: .cloudAgent,
            title: item.work.title,
            preview: "\(chatLabel) · \(name)",
            // Status is the row's meta, not its preview: it is the fact that
            // changes while the row sits there, so it keeps the fixed trailing
            // column rather than competing with the Chat it came from.
            meta: CloudAgentPresentation(work: item.work, delegatedBy: name).statusText(at: now),
            open: .cloudAgentWork(messageID: item.work.messageId)
        )
    }

    /// The snapshot carries one event per Agent — the step it is on — so
    /// elapsed is time in that step, which is the number that answers "is this
    /// moving?". The run's own start is not in this projection.
    static func agentRow(_ agent: InboxWorkingAgent, now: Date) -> InboxHappeningNowRow {
        InboxHappeningNowRow(
            id: "agent:\(agent.id)",
            mark: .identity(name: agent.name, avatarURL: agent.avatarURL, presence: agent.presence),
            title: agent.name,
            preview: InboxElapsed.stepWithElapsed(agent.step, occurredAt: agent.occurredAt, now: now),
            meta: nil,
            open: .agent(agent.id)
        )
    }
}
