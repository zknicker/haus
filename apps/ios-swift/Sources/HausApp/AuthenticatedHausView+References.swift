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
        InAppReferenceRoutes.openTaskCard = { reference in
            if let serverID = store.activeServer?.id { store.drafts.aim(at: reference.taskID, serverID: serverID) }
            router.open(.task(taskID: reference.taskID), from: .taskCard)
        }
        InAppReferenceRoutes.openPullRequest = { url in
            guard let pullRequest = PullRequestLookup.find(url: url, in: store.knownPullRequests) else {
                return nil
            }
            return { router.open(.pullRequest(pullRequest.reading)) }
        }
        InAppReferenceRoutes.openDriveArtifact = { target in
            guard let path = store.sharedArtifactDrivePath(target) else { return nil }
            return { router.open(.driveFile(path: path)) }
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
