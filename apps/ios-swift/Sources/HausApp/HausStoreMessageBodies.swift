import Foundation
import HausModels
import HausUI

/// Message bodies resolved for drawing: the memoized parse and the reference
/// chips it resolves against Server state.
extension HausStore {
    /// The body parse is the expensive step of a row, so it is memoized per
    /// message and survives every rebuild that cannot change it.
    func parsedBody(
        id: String,
        content: String,
        chatID: String,
        taskLinks: [TaskLink] = []
    ) -> ParsedMessageBody {
        let revision = projections.referenceRevision
        // Task links ride the Message rather than the reference directory: a
        if let cached = projections.bodies.cached(id: id, content: content, revision: revision),
           cached.taskLinks == taskLinks {
            return cached
        }
        let (body, visuals) = MessagePresentation.resolvedBody(content: content)
        let blocks = SharedArtifactLinkScope.$current.withValue(projections.sharedArtifacts.scope) {
            richMessageBlocks(visuals.prose)
        }
        let parsed = ParsedMessageBody(
            body: body,
            visuals: visuals,
            richBlocks: TaskLinkChips.apply(taskLinks, to: blocks),
            taskLinks: taskLinks
        )
        projections.bodies.remember(parsed, id: id, content: content, revision: revision)
        return parsed
    }

    /// A Task description drawn the way a message body is: the Server's
    /// resolved description through the same reference resolver, with its
    /// Task keys chipped from the links the Server resolved for it.
    func taskDescriptionBlocks(_ detail: TaskDetail) -> [RichMessageBlock] {
        TaskLinkChips.apply(
            detail.descriptionTaskLinks,
            to: richMessageBlocks(detail.descriptionContent)
        )
    }

    private func richMessageBlocks(_ content: String) -> [RichMessageBlock] {
        RichMessageBlockParser.blocks(content) { kind, id, fallback in
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
            case .sharedArtifact:
                return sharedArtifactReference(key: id)
            // No other kind names Server state, so the parser's own chip stands.
            default: return nil
            }
        }
    }
}
