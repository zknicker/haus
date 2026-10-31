import Foundation
import HausUI

extension HausStore {
    /// Closes the live streams before clearing auth, then drops this account's
    /// app-local state so it cannot paint the next session.
    func signOut() async throws {
        stopEventStreams()
        let push = PushNotifications.shared
        await push.prepareForSignOut()
        HausRuntimeConfiguration.recordExplicitSignOut()
        do {
            try await authClient.signOut()
        } catch {
            HausRuntimeConfiguration.clearExplicitSignOut()
            push.signOutFailed()
            if let serverID = activeServer?.id {
                startEventStreams(serverID: serverID)
            }
            throw error
        }
        push.didSignOut()
        await clearLaunchSnapshot()
        UserDefaults.standard.removeObject(forKey: ChatDestination.ID.lastOpenDefaultsKey)
        AvatarImageCache.shared.removeAll()
        AttachmentImageMemory.removeAll()
        do {
            try await attachmentFiles.removeAll()
        } catch {
            Self.logger.error(
                "Sign-out could not clear cached attachments: \(error.localizedDescription, privacy: .public)"
            )
        }
    }
}
