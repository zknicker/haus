import Foundation
import HausAppModel
import HausModels
import HausUI

/// What the pull request and Drive file routes read from the Store.
extension HausStore {
    /// Every pull request the App holds a reading for, from loaded Tasks.
    var knownPullRequests: [PullRequestPresentation] {
        PullRequestCatalog.presentations(tasks: Array(tasks.detailsByID.values), captains: pullRequestAuthors)
    }

    /// The route's reading with what the place knows about it, freshest first.
    func pullRequestPresentation(_ reading: PullRequestReading) -> PullRequestPresentation {
        knownPullRequests.first { $0.id == reading.id } ?? PullRequestPresentation(reading: reading)
    }

    /// The Drive reads a file preview makes.
    var driveFileReads: DriveFileReads {
        DriveFileReads(
            text: { [drive] record in try await drive.text(record) },
            file: { artifact in
                guard let file = SharedArtifactReader.file else { throw SharedArtifactUnavailable.failed }
                return try await file(artifact)
            }
        )
    }
}
