import SwiftUI

#Preview("Human profile") {
    NavigationStack {
        HumanProfileView(person: SettingsFixtures.viewer) { _, _ in }
    }
}

#Preview("Agent profile") {
    NavigationStack {
        AgentProfileView(agent: SettingsFixtures.blippy) { _, _ in }
    }
}
