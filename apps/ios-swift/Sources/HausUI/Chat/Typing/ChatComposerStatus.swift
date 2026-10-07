import SwiftUI

/// Everything the conversation says about itself just above the composer: a
/// stopped peer Agent's notice, then who is answering right now. Chat and
/// Thread screens place it at the top of their composer inset; both pieces
/// take no space while there is nothing to say.
///
/// Its sources come from the environment rather than the screen's arguments,
/// because they are app-wide services, not facts about one Chat.
public struct ChatComposerStatus: View {
    /// The durable Chat whose engagements to show; nil before a DM exists.
    private let chatID: String?
    /// The DM's peer Agent, whose stopped state the notice reports.
    private let peerAgentID: String?

    @Environment(\.chatEngagementSource) private var engagementSource
    @Environment(\.stoppedAgentSource) private var stoppedSource

    public init(chatID: String?, peerAgentID: String? = nil) {
        self.chatID = chatID
        self.peerAgentID = peerAgentID
    }

    public var body: some View {
        VStack(spacing: 0) {
            if let peerAgentID, let stoppedSource, let name = stoppedSource.stoppedAgentName(peerAgentID) {
                StoppedAgentNotice(
                    name: name,
                    canStart: stoppedSource.canStart(),
                    onStart: { try await stoppedSource.start(peerAgentID) }
                )
                .transition(.opacity)
            }
            if let chatID, let engagementSource {
                ChatTypingStrip(chatID: chatID, source: engagementSource)
                    .id(chatID)
            }
        }
        .animation(.easeOut(duration: 0.22), value: peerAgentID.flatMap { stoppedSource?.stoppedAgentName($0) })
    }
}
