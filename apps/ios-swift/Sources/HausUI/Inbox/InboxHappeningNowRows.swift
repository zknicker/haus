import Foundation
import HausModels

/// The Agent or member behind a row, as the App layer's directory resolves it.
/// Nil is an actor this client no longer lists, which each row names itself.
public typealias InboxActorResolver = (_ agentID: String?, _ userID: String?) -> MessageAuthorPresentation?

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
            ?? InboxActorName.stored(item.message.author)
        let chatLabel = InboxConversationLabel.text(kind: item.chatKind, name: item.chatName)
        return InboxHappeningNowRow(
            id: "work:\(item.work.messageId)",
            mark: .cloudAgent(isRunning: item.work.status == .running),
            title: workTitle(item.work.title),
            // Status trails the title rather than joining this line: it is the
            // fact that changes while the row sits there. The boxed glyph already
            // says this is Cloud work, so the detail is only where and who.
            status: CloudAgentPresentation(work: item.work).statusText(at: now),
            detail: "\(chatLabel) · \(name)",
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
            status: InboxElapsed.label(since: agent.occurredAt, now: now),
            detail: agent.step.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                ? "Working…"
                : agent.step,
            open: .agent(agent.id)
        )
    }

    /// Work can be delegated without a title; the row still needs a first line.
    static func workTitle(_ title: String) -> String {
        let trimmed = title.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? "Cloud work" : trimmed
    }
}
