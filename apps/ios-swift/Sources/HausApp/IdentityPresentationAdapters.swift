import Foundation
import HausModels
import HausUI

/// The two identity facts every projection ends in: what an Agent's
/// availability looks like, and where a stored avatar path actually lives.
///
/// They sit beside the projections rather than inside any one of them because
/// transcripts, activity, tasks, Asks, and settings all finish the same way.
extension HausStore {
    func presence(_ availability: AgentAvailability) -> AgentPresence {
        switch availability {
        case .error: .error
        case .idle: .idle
        case .offline: .offline
        case .stopped: .stopped
        case .working: .working
        }
    }

    /// Avatar paths are stored Server-relative, so they only resolve against
    /// the Server this build talks to.
    func resolvedAvatarURL(_ value: String?) -> URL? {
        guard let value else { return nil }
        return URL(string: value, relativeTo: HausRuntimeConfiguration.serverOrigin)?.absoluteURL
    }
}
