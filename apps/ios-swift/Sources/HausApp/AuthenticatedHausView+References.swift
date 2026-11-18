import HausModels
import HausUI
import SwiftUI

/// What a transcript row reaches beyond itself: a tapped Message or Task chip,
/// an opened artifact page or shared artifact, and Try Again or Delete on a
/// failed send. Rows live in hosted cells with no environment, so the App
/// installs these once at its root (`InAppReferenceRoutes`,
/// `ArtifactPageReader`, `SharedArtifactReader`).
extension AuthenticatedHausView {
    func installTranscriptRoutes() {
        InAppReferenceRoutes.openMessage = { reference in
            openCanvasChat(.chat(reference.chatID), revealing: reference.messageID)
        }
        InAppReferenceRoutes.openTask = { reference in
            openTask(reference.taskID)
        }
        ArtifactPageReader.read = { [store] agentID, path in
            try await store.readArtifactPage(agentID: agentID, path: path)
        }
        store.installSharedArtifactReader()
        FailedSendRoutes.retry = { [store] messageID in
            Task { await store.retryFailedSend(messageID: messageID) }
        }
        FailedSendRoutes.delete = { [store] messageID in
            store.deleteFailedSend(messageID: messageID)
        }
    }
}
