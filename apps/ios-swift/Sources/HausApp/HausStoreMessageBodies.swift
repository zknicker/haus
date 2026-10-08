import Foundation
import HausModels
import HausUI

/// Message bodies resolved for drawing: the memoized parse and the reference
/// chips it resolves against Server state.
extension HausStore {
    /// The body parse is the expensive step of a row, so it is memoized per
    /// message and survives every rebuild that cannot change it.
    func parsedBody(id: String, content: String, chatID: String) -> ParsedMessageBody {
        let parsed = memoizedBody(id: id, content: content)
        if !parsed.threadChips.isEmpty {
            projections.threadChipReferrers.record(
                referrer: chatID,
                references: parsed.threadChips.keys.compactMap { ThreadReferenceTarget(wireTarget: $0)?.chatID }
            )
        }
        return parsed
    }

    private func memoizedBody(id: String, content: String) -> ParsedMessageBody {
        let revision = projections.referenceRevision
        if let cached = projections.bodies.cached(id: id, content: content, revision: revision),
           cached.threadChips.allSatisfy({ threadReferencePresentation(wireTarget: $0.key)?.label == $0.value }) {
            return cached
        }
        let (body, visuals) = MessagePresentation.resolvedBody(content: content)
        var threadChips: [String: String?] = [:]
        let blocks = richMessageBlocks(visuals.prose) { target, label in threadChips.updateValue(label, forKey: target) }
        let parsed = ParsedMessageBody(body: body, visuals: visuals, richBlocks: blocks, threadChips: threadChips)
        projections.bodies.remember(parsed, id: id, content: content, revision: revision)
        return parsed
    }

    private func richMessageBlocks(
        _ content: String,
        onThreadChip: (_ wireTarget: String, _ label: String?) -> Void
    ) -> [RichMessageBlock] {
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
            case .thread:
                let chip = threadReferencePresentation(wireTarget: id)
                onThreadChip(id, chip?.label)
                return chip
            // No other kind names Server state, so the parser's own chip stands.
            default: return nil
            }
        }
    }
}
