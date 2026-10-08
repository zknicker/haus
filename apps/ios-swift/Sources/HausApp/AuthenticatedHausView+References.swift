import HausModels
import HausUI
import SwiftUI

/// What a transcript row reaches beyond itself: a tapped Thread chip and an
/// opened artifact page. Rows live in hosted cells with no environment, so the
/// App installs these once at its root (`InAppReferenceRoutes`,
/// `ArtifactPageReader`).
extension AuthenticatedHausView {
    func installTranscriptRoutes() {
        InAppReferenceRoutes.openThread = { reference in
            openReferencedThread(reference)
        }
        ArtifactPageReader.read = { [store] agentID, path in
            try await store.readArtifactPage(agentID: agentID, path: path)
        }
    }

    /// A Thread chip opens its Thread over its parent Chat, the way the
    /// Thread's own preview card does, so Back lands in the conversation the
    /// Thread belongs to.
    func openReferencedThread(_ reference: ThreadReferenceTarget) {
        Task {
            guard let selection = await store.threadSelection(for: reference) else { return }
            pushThread(selection, selectingParent: reference.chatID)
        }
    }
}
