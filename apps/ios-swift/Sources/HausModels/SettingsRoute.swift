/// A settings screen. It lives below the UI so the router's `settings`
/// route can carry it.
public enum SettingsRoute: Hashable, Sendable {
    case profile
    case agent(id: String)
    case agentRuntime(id: String)
    case agentAutomations(id: String)
    case server
    case people
    case computers
    case cloudAgents
    case appInfo
    case description(ownerID: String, title: String)
}
