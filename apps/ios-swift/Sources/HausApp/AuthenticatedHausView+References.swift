import HausModels
import HausUI
import SwiftUI

/// `ArtifactPageReader`, `SharedArtifactReader`).
extension AuthenticatedHausView {
    func installTranscriptRoutes() {
        InAppReferenceRoutes.openMessage = { reference in
            router.open(route(forChatID: reference.chatID, messageID: reference.messageID))
        }
        InAppReferenceRoutes.openTask = { reference in
            router.open(.task(taskID: reference.taskID))
        }
        InAppReferenceRoutes.openWorker = { workerID in
            router.open(.worker(workerID: workerID))
        }
        InAppReferenceRoutes.openPullRequest = { url in
            guard let pullRequest = PullRequestLookup.find(url: url, in: store.knownPullRequests(now: .now)) else {
                return nil
            }
            return { router.open(.pullRequest(pullRequest.reading)) }
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
