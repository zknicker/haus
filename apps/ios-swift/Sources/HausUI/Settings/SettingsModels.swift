import Foundation
import HausModels

/// Presentation data for the native settings sheet. The Server remains the source
/// of truth; these value types keep SwiftUI independent from transport response shapes.
public struct SettingsServer: Identifiable, Hashable, Sendable {
    public let id: String
    public let name: String
    public let slug: String
    public let role: String
    public let memberCount: Int
    public let agentCount: Int

    public init(
        id: String,
        name: String,
        slug: String,
        role: String,
        memberCount: Int,
        agentCount: Int
    ) {
        self.id = id
        self.name = name
        self.slug = slug
        self.role = role
        self.memberCount = memberCount
        self.agentCount = agentCount
    }
}
public struct SettingsPerson: Identifiable, Hashable, Sendable {
    public let id: String
    public let displayName: String
    public let handle: String?
    public let email: String?
    public let role: String
    public let joined: String
    public let description: String
    public let avatarURL: URL?
    public let initials: String
    /// The human's IANA zone, nil until an App reports one.
    public let timezone: String?

    public init(
        id: String,
        displayName: String,
        handle: String? = nil,
        email: String? = nil,
        role: String = "Member",
        joined: String = "",
        description: String = "",
        avatarURL: URL? = nil,
        initials: String? = nil,
        timezone: String? = nil
    ) {
        self.id = id
        self.displayName = displayName
        self.handle = handle
        self.email = email
        self.role = role
        self.joined = joined
        self.description = description
        self.avatarURL = avatarURL
        self.initials = initials ?? Self.makeInitials(from: displayName)
        self.timezone = timezone
    }

    private static func makeInitials(from name: String) -> String {
        let parts = name.split(whereSeparator: { $0 == " " || $0 == "-" })
        let letters = parts.prefix(2).compactMap(\.first)
        return String(letters).uppercased()
    }
}
public struct SettingsAgent: Identifiable, Hashable, Sendable {
    public let id: String
    public let displayName: String
    public let handle: String
    public let description: String
    public let runtime: String
    public let model: String
    public let status: String
    public let avatarURL: URL?
    public let presence: AgentPresence
    public let initials: String
    /// Haus's own factory Agents keep a product-owned avatar the Server
    /// refuses to replace, so only an ordinary Agent offers the generator.
    public let canGenerateAvatar: Bool
    public let runtimeConfiguration: SettingsAgentRuntimeConfiguration?

    public init(
        id: String,
        displayName: String,
        handle: String,
        description: String = "",
        runtime: String = "Managed",
        model: String = "Default",
        status: String = "Online",
        avatarURL: URL? = nil,
        presence: AgentPresence = .idle,
        initials: String? = nil,
        canGenerateAvatar: Bool = true,
        runtimeConfiguration: SettingsAgentRuntimeConfiguration? = nil
    ) {
        self.id = id
        self.displayName = displayName
        self.handle = handle
        self.description = description
        self.runtime = runtime
        self.model = model
        self.status = status
        self.avatarURL = avatarURL
        self.presence = presence
        self.initials = initials ?? Self.makeInitials(from: displayName)
        self.canGenerateAvatar = canGenerateAvatar
        self.runtimeConfiguration = runtimeConfiguration
    }

    private static func makeInitials(from name: String) -> String {
        let parts = name.split(whereSeparator: { $0 == " " || $0 == "-" })
        let letters = parts.prefix(2).compactMap(\.first)
        return String(letters).uppercased()
    }
}

/// Maps an execution-runtime slug to its product name for display. Unknown
/// slugs pass through unchanged so a new runtime never shows as blank.
public func settingsRuntimeDisplayName(_ slug: String) -> String {
    switch slug.lowercased() {
    case "codex": "Codex"
    case "claude-code", "claude_code": "Claude Code"
    case "pi": "Pi"
    case "grok-build", "grok_build": "Grok Build"
    default: slug
    }
}

/// Native settings projection of the Server-backed `computer.list` result.
/// Keeping display labels here means SwiftUI does not depend on wire models.
public struct SettingsComputer: Identifiable, Hashable, Sendable {
    public let id: String
    public let name: String
    public let health: String
    public let isHealthy: Bool
    public let system: String
    public let version: String

    public init(id: String, name: String, health: String, isHealthy: Bool, system: String, version: String) {
        self.id = id
        self.name = name
        self.health = health
        self.isHealthy = isHealthy
        self.system = system
        self.version = version
    }
}

public struct SettingsData: Hashable, Sendable {
    public let server: SettingsServer
    public let viewer: SettingsPerson
    public let members: [SettingsPerson]
    public let agents: [SettingsAgent]
    public let computers: [SettingsComputer]?

    public init(
        server: SettingsServer,
        viewer: SettingsPerson,
        members: [SettingsPerson] = [],
        agents: [SettingsAgent],
        computers: [SettingsComputer]? = nil
    ) {
        self.server = server
        self.viewer = viewer
        self.members = members
        self.agents = agents
        self.computers = computers
    }
}

public enum SettingsFixtures {
    public static let server = SettingsServer(
        id: "server-haus",
        name: "Haus",
        slug: "haus",
        role: "Owner",
        memberCount: 1,
        agentCount: 1
    )

    public static let viewer = SettingsPerson(
        id: "member-zach",
        displayName: "Zach Knickerbocker",
        handle: "zachknickerbocker",
        email: "zknicker@gmail.com",
        role: "Owner",
        joined: "Aug 11, 2026",
        initials: "ZK",
        timezone: "America/New_York"
    )

    public static let cove = SettingsAgent(
        id: "agent-cove",
        displayName: "Cove",
        handle: "cove",
        description: "Onboarding Assistant",
        runtime: "Computer",
        model: "Default",
        status: "Online",
        initials: "CO",
        canGenerateAvatar: false
    )

    public static let blippy = SettingsAgent(
        id: "agent-blippy",
        displayName: "Blippy",
        handle: "blippy",
        description: "Ships small changes and keeps the board honest.",
        runtime: "Computer",
        model: "Default",
        status: "Online",
        initials: "BL"
    )

    public static let computers = [
        SettingsComputer(
            id: "computer-preview",
            name: "Zach's MacBook Pro",
            health: "Online",
            isHealthy: true,
            system: "Mac · Apple Silicon",
            version: "v1.0.0"
        ),
    ]

    public static let data = SettingsData(
        server: server,
        viewer: viewer,
        members: [viewer],
        agents: [cove],
        computers: computers
    )
}
