import Foundation
import HausModels

/// The name a row falls back to when the directory no longer lists its actor:
/// the Message's own stored author profile, and a generic noun for one that
/// left no profile either.
public enum StoredActorName {
    public static func text(_ author: ChatAuthor) -> String {
        switch author {
        case .agent(let agentID, let profile):
            profile?.displayName ?? "Captain \(String(agentID.suffix(6)))"
        case .human(let profile, _):
            profile?.displayName ?? "Haus member"
        case .system:
            "Haus"
        }
    }
}
