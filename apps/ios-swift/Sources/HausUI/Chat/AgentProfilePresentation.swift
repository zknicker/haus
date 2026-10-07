import Foundation

/// One labeled read-only fact on an Agent profile.
public struct AgentProfileField: Identifiable, Hashable, Sendable {
    public let title: String
    public let value: String

    public var id: String { title }

    public init(title: String, value: String) {
        self.title = title
        self.value = value
    }
}

/// The Agent facts a Chat details push shows beyond the identity the Chat
/// already carries.
///
/// Chat details is an inspection surface, so this stays read-only and carries
/// no edit affordances. A field the Server never filled in drops its row rather
/// than showing an empty value, which keeps a sparse Agent from reading as a
/// broken screen.
public struct AgentProfilePresentation: Hashable, Sendable {
    public let handle: String
    public let description: String
    public let runtime: String
    public let model: String
    /// Why the Server stopped waking this Agent on its own, while it has.
    public let wakePause: AgentWakePausePresentation?

    public init(
        handle: String = "",
        description: String = "",
        runtime: String = "",
        model: String = "",
        wakePause: AgentWakePausePresentation? = nil
    ) {
        self.handle = handle
        self.description = description
        self.runtime = runtime
        self.model = model
        self.wakePause = wakePause
    }

    /// The `@handle` the hero shows under the Agent's name, or nothing.
    public var displayHandle: String? {
        guard let trimmed = Self.cleaned(handle) else { return nil }
        return trimmed.hasPrefix("@") ? trimmed : "@\(trimmed)"
    }

    /// The Agent's own words, or nothing to show.
    public var about: String? {
        Self.cleaned(description)
    }

    /// Execution reads as one list: the hero already carries presence, so a
    /// separate status row would say the same thing twice.
    public var detailFields: [AgentProfileField] {
        [("Runtime", runtime), ("Model", model)].compactMap { title, value in
            Self.cleaned(value).map { AgentProfileField(title: title, value: $0) }
        }
    }

    private static func cleaned(_ value: String) -> String? {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }
}
