import Foundation
import HausModels
import HausUI

/// Message bodies resolved for drawing: the memoized parse and the reference
/// chips it resolves against Server state.
extension HausStore {
    /// The body parse is the expensive step of a row, so it is memoized per
    /// message and survives every rebuild that cannot change it.
    func parsedBody(id: String, content: String, chatID: String, sentAt: Date) -> ParsedMessageBody {
        let parsed = memoizedBody(id: id, content: content, sentAt: sentAt)
        if !parsed.threadChips.isEmpty {
            projections.threadChipReferrers.record(
                referrer: chatID,
                references: parsed.threadChips.keys.compactMap { ThreadReferenceTarget(wireTarget: $0)?.chatID }
            )
        }
        return parsed
    }

    private func memoizedBody(id: String, content: String, sentAt: Date) -> ParsedMessageBody {
        let revision = projections.referenceRevision
        let timeChips = TimeChipContext(sentAt: sentAt, viewerZone: viewerTimeZone)
        let stamp = "\(TimeReference.dayStamp(zone: timeChips.viewerZone)) \(sentAt.timeIntervalSince1970)"
        if let cached = projections.bodies.cached(id: id, content: content, revision: revision),
           cached.threadChips.allSatisfy({ threadReferencePresentation(wireTarget: $0.key)?.label == $0.value }),
           cached.timeChipStamp.map({ $0 == stamp }) ?? true {
            return cached
        }
        let (body, visuals) = MessagePresentation.resolvedBody(content: content)
        var threadChips: [String: String?] = [:]
        var hasTimeChips = false
        let blocks = richMessageBlocks(
            visuals.prose,
            timeChips: timeChips,
            onTimeChip: { hasTimeChips = true },
            onThreadChip: { target, label in threadChips.updateValue(label, forKey: target) }
        )
        let parsed = ParsedMessageBody(
            body: body,
            visuals: visuals,
            richBlocks: blocks,
            threadChips: threadChips,
            timeChipStamp: hasTimeChips ? stamp : nil
        )
        projections.bodies.remember(parsed, id: id, content: content, revision: revision)
        return parsed
    }

    /// The zone the viewer saved (ADR 0040), else the device's: every time
    /// chip reads in it.
    private var viewerTimeZone: TimeZone {
        members
            .flatMap { membersByID[$0.viewerUserID]?.timezone }
            .flatMap(TimeZone.init(identifier:))
            ?? .current
    }

    private func richMessageBlocks(
        _ content: String,
        timeChips: TimeChipContext,
        onTimeChip: () -> Void,
        onThreadChip: (_ wireTarget: String, _ label: String?) -> Void
    ) -> [RichMessageBlock] {
        RichMessageBlockParser.blocks(content, timeChips: timeChips) { kind, id, fallback in
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
            case .time:
                // The parser words the chip in the viewer's zone; the memo
                // only needs to know the body has one.
                onTimeChip()
                return nil
            // No other kind names Server state, so the parser's own chip stands.
            default: return nil
            }
        }
    }
}
