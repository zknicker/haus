import Foundation
import HausModels
import SwiftUI

/// One Agent answering the open Chat, as the header draws it.
public struct ChatTypist: Identifiable, Hashable, Sendable {
    public let id: String
    public let name: String
    public let avatarURL: URL?

    public init(id: String, name: String, avatarURL: URL?) {
        self.id = id
        self.name = name
        self.avatarURL = avatarURL
    }
}

/// What the header's engagement row reads from the App: the live connection for one
/// Chat and the Agent directory that names its typists. Installed once at the
/// app root; absent in previews, where the header shows nothing extra.
public struct ChatEngagementSource: Sendable {
    /// Streams one Chat's engagements and thoughts into the model until the
    /// task is cancelled. Every (re)connect re-reads the durable state.
    public let connect: @MainActor @Sendable (_ chatID: String, _ model: ChatTypingModel) async -> Void
    /// The typist an engaged Agent reads as, or nil while the directory does
    /// not know it — an unknown Agent is left out rather than named generically.
    public let typist: @MainActor @Sendable (_ agentID: String) -> ChatTypist?

    public init(
        connect: @escaping @MainActor @Sendable (String, ChatTypingModel) async -> Void,
        typist: @escaping @MainActor @Sendable (String) -> ChatTypist?
    ) {
        self.connect = connect
        self.typist = typist
    }
}

extension EnvironmentValues {
    @Entry public var chatEngagementSource: ChatEngagementSource?
}

/// The engagement row's words. The row itself shows no text, so these are
/// what VoiceOver reads for it.
public enum ChatTypingLabel {
    /// One typist per engaged Agent, in engagement order, each Agent once.
    public static func typists(
        _ engagements: [ChatEngagement],
        resolve: (String) -> ChatTypist?
    ) -> [ChatTypist] {
        var seen: Set<String> = []
        return engagements.compactMap { engagement in
            guard !seen.contains(engagement.agentID), let typist = resolve(engagement.agentID) else {
                return nil
            }
            seen.insert(engagement.agentID)
            return typist
        }
    }

    /// "Juniper is working", "Juniper and Cove are working", and from three on
    /// "Juniper, Cove, and 2 others are working".
    public static func text(_ names: [String]) -> String? {
        guard let first = names.first else { return nil }
        guard names.count > 1 else { return "\(first) is working" }
        if names.count == 2 { return "\(first) and \(names[1]) are working" }
        let others = names.count - 2
        return "\(first), \(names[1]), and \(others) \(others == 1 ? "other" : "others") are working"
    }
}
