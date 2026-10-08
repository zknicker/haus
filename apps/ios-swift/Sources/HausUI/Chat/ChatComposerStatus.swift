import SwiftUI

/// What the conversation says about itself just above the composer: a stopped
/// peer Agent's notice. It takes no space while there is nothing to say. Who
/// is answering right now lives in the header (`HeaderEngagement`).
///
/// Its source comes from the environment rather than the screen's arguments,
/// because it is an app-wide service, not a fact about one Chat.
struct ChatComposerStatus: View {
    /// The DM's peer Agent, whose stopped state the notice reports.
    let peerAgentID: String?

    @Environment(\.stoppedAgentSource) private var stoppedSource

    var body: some View {
        let name = peerAgentID.flatMap { stoppedSource?.stoppedAgentName($0) }
        VStack(spacing: 0) {
            if let peerAgentID, let stoppedSource, let name {
                StoppedAgentNotice(
                    name: name,
                    canStart: stoppedSource.canStart(),
                    onStart: { try await stoppedSource.start(peerAgentID) }
                )
                .transition(.opacity)
            }
        }
        .animation(.easeOut(duration: 0.22), value: name)
    }
}
