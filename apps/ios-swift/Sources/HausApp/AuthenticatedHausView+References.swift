import HausModels
import HausUI
import SwiftUI

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
