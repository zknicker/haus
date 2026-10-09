import Observation
import SwiftUI

/// Which Thread Cloud Agent stacks the reader has expanded, by the Thread's
/// anchor Message id. It lives for the signed-in session above the chat list,
/// so a stack stays open when its row scrolls away and comes back or the Chat
/// is reopened. Every stack starts collapsed.
@MainActor
@Observable
public final class ThreadCloudAgentStackExpansion {
    private var expandedAnchorIDs: Set<String> = []

    public init() {}

    public func isExpanded(anchorMessageID: String) -> Bool {
        expandedAnchorIDs.contains(anchorMessageID)
    }

    public func setExpanded(_ expanded: Bool, anchorMessageID: String) {
        if expanded {
            expandedAnchorIDs.insert(anchorMessageID)
        } else {
            expandedAnchorIDs.remove(anchorMessageID)
        }
    }
}

private struct ThreadCloudAgentStackExpansionKey: EnvironmentKey {
    static let defaultValue: ThreadCloudAgentStackExpansion? = nil
}

extension EnvironmentValues {
    /// The session's stack expansion. Nil in previews and fixtures, where a
    /// stack keeps its expansion in the row alone.
    public var threadCloudAgentStackExpansion: ThreadCloudAgentStackExpansion? {
        get { self[ThreadCloudAgentStackExpansionKey.self] }
        set { self[ThreadCloudAgentStackExpansionKey.self] = newValue }
    }
}
