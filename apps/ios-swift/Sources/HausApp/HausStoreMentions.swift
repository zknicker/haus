import Foundation
import HausModels
import HausTransport
import HausUI

extension HausStore {
    func mentionOptions(for destination: ChatDestination) -> [MentionOptionPresentation] {
        mentionOptionsByDestinationID[destination.id] ?? []
    }

    func loadMentionOptions(for destination: ChatDestination) async {
        guard let serverID = activeServer?.id else { return }
        do {
            let response: MentionOptions
            switch destination {
            case .durableChat(let chat):
                response = try await client.query(
                    "chat.mentionOptions",
                    input: ChatMentionOptionsInput(chatID: chat.id, serverID: serverID)
                )
            case .implicitCaptainChat(let agent):
                response = try await client.query(
                    "chat.mentionOptions",
                    input: CaptainMentionOptionsInput(agentID: agent.id, serverID: serverID)
                )
            }
            mentionOptionsByDestinationID[destination.id] = response.options.compactMap {
                mentionPresentation($0)
            }
        } catch is CancellationError {
            return
        } catch {
            Self.logger.error(
                "Loading mention options failed: \(error.localizedDescription, privacy: .public)"
            )
        }
    }

    private func mentionPresentation(_ option: MentionOption) -> MentionOptionPresentation? {
        // A kind this build does not model drops its own row and leaves the rest
        // of the roster standing.
        guard let optionKind = option.kind else { return nil }
        let kind: MentionPresentationKind
        var detail = option.description
        var avatarURL: URL?
        var channelAppearance: ChannelAppearance?
        switch optionKind {
        case .agent:
            kind = .agent
            let agentID = referenceID(option.id, scheme: "agent")
            avatarURL = agentID
                .flatMap { agentsByID[$0]?.avatarURL }
                .flatMap(resolvedAvatarURL)
        case .chat:
            kind = .channel
            channelAppearance = ChannelAppearance(
                icon: option.metadata?.chatIcon,
                color: option.metadata?.chatColor
            )
        case .user:
            kind = .human
            avatarURL = resolvedAvatarURL(option.metadata?.userAvatarURL)
        case .skill:
            kind = .skill
            // The Server sends a Skill's own sentence in its metadata; the
            // top-level description restates it and stands in if it is missing.
            detail = option.metadata?.description ?? option.description
        }
        return MentionOptionPresentation(
            id: option.id,
            insertText: option.insertText,
            label: option.label,
            detail: detail,
            kind: kind,
            avatarURL: avatarURL,
            channelAppearance: channelAppearance
        )
    }

    private func referenceID(_ target: String, scheme: String) -> String? {
        let prefix = "\(scheme)://"
        guard target.hasPrefix(prefix) else { return nil }
        return String(target.dropFirst(prefix.count)).removingPercentEncoding
    }
}
