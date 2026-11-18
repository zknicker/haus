import SwiftUI

/// How the shell reaches its sheets and the Chats they hand back. The canvas
/// owns what is on screen; this extension owns which surface asked for it.
extension HausShellView {
    func selectCreatedChannel(_ channel: CreatedChannelPresentation) {
        selectChannel(id: channel.id)
    }

    /// A restored channel reappears in `chats` on the next Server list, exactly
    /// like a freshly created one, so both wait on the same pending selection.
    func selectRestoredChannel(_ channel: ArchivedChannelPresentation) {
        selectChannel(id: channel.id)
    }

    private func selectChannel(id: String) {
        if let chat = destinations.compactMap(\.durableChat).first(where: { $0.id == id }) {
            open(chat)
            return
        }
        pendingChatSelectionID = id
        activeChatSheet = nil
    }

    /// Every sidebar entry point leaves the drawer open behind the surface it
    /// presents: closing it in the same frame runs two animations at once, and
    /// dismissing would land on a canvas the user never asked to return to.
    func openSettings() {
        settingsRequest = SettingsPresentationRequest(path: [])
    }

    /// Escalation only. Inspecting an Agent is a push inside the details
    /// sheet's own stack; this is the deliberate hop to Settings for editing,
    /// which the profile's "Manage in Settings" row asks for by name.
    ///
    /// Chat details and Settings are mutually exclusive sheets, so the details
    /// sheet dismisses first and Settings presents from its `onDismiss`.
    func openAgentProfile(_ agentID: String) {
        queuedSettingsRequest = SettingsPresentationRequest(path: [.agent(id: agentID)])
        activeChatSheet = nil
    }

    func presentQueuedSettings() {
        guard let queuedSettingsRequest else { return }
        self.queuedSettingsRequest = nil
        settingsRequest = queuedSettingsRequest
    }
}
