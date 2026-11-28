/// A settings screen. It lives below the UI so the router's `settings`
/// route can carry it.
public enum SettingsRoute: Hashable, Sendable {
    case profile
    case agent(id: String)
    case agentRuntime(id: String)
    case agentAutomations(id: String)
    case automations
    case drive(prefix: String)
    case general
    case notifications
    case captains
    case models
    case modelUsage
    case projects
    case project(id: String)
    case server
    case people
    case computers
    case appInfo
    case description(ownerID: String, title: String)
}
