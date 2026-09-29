import Foundation
import HausUI

extension HausStore {
    /// Ends the Clerk session, then drops this account's app-local state.
    ///
    /// A Clerk failure throws before anything is cleared, so the caller stays
    /// signed in with a working app. Once Clerk has ended the session the auth
    /// boundary unmounts this Store and its in-memory Server snapshots with it;
    /// what remains is state that outlives the Store on this device.
    func signOut() async throws {
        // The Server scopes push devices to this member, so it has to hear
        // before the session ends.
        let push = PushNotifications.shared
        await push.prepareForSignOut()
        // Recorded before Clerk drops the session: the Debug auth boundary
        // reacts to the lost session and must already see this was a human
        // sign-out, or it auto signs straight back in.
        HausRuntimeConfiguration.recordExplicitSignOut()
        do {
            try await clerk.auth.signOut()
        } catch {
            HausRuntimeConfiguration.clearExplicitSignOut()
            push.signOutFailed()
            throw error
        }
        push.didSignOut()
        stopEventStreams()
        // The restored last-open Chat names a Chat on this account's Server.
        UserDefaults.standard.removeObject(forKey: ChatDestination.ID.lastOpenDefaultsKey)
        // Avatars on disk are this account's people and Agents.
        AvatarImageCache.shared.removeAll()
        AttachmentImageMemory.removeAll()
        do {
            try await attachmentFiles.removeAll()
        } catch {
            // The session is already gone, so this cannot undo the sign-out;
            // the next account still never sees these files unless its own
            // Server lists the same attachment.
            Self.logger.error(
                "Sign-out could not clear cached attachments: \(error.localizedDescription, privacy: .public)"
            )
        }
    }
}
