import Foundation
import HausModels
import Testing
@testable import HausAppModel

@MainActor
@Suite("Live Projects and Drive")
struct LiveProjectsAndDriveTests {
    @Test("project.onUpdated re-reads the Project list only once one has landed")
    func projectsRecoverOnceLoaded() {
        let held = [AppModelFixtures.project("project_a")]
        #expect(ProjectsModel.recovers([.projects], holding: held))
        #expect(!ProjectsModel.recovers([.projects], holding: nil))
        #expect(!ProjectsModel.recovers([.chatList, .driveListings], holding: held))
    }

    @Test("artifact.onUpdated re-reads the named file's open previews, or every one for a null id")
    func driveFileRefreshTargets() throws {
        let files = [
            "reports/chart.png": try record(id: "art_1", path: "reports/chart.png"),
            "reports/copy.png": try record(id: "art_1", path: "reports/copy.png"),
            "notes.md": try record(id: "art_2", path: "notes.md"),
        ]
        #expect(DriveModel.paths(in: files, changedArtifact: "art_1") == ["reports/chart.png", "reports/copy.png"])
        #expect(DriveModel.paths(in: files, changedArtifact: "art_9").isEmpty)
        #expect(DriveModel.paths(in: files, changedArtifact: nil) == ["notes.md", "reports/chart.png", "reports/copy.png"])
        #expect(DriveModel.paths(in: [:], changedArtifact: nil).isEmpty)
    }

    private func record(id: String, path: String) throws -> ArtifactRecord {
        let json = """
        {"artifact_id":"\(id)","author":{"type":"haus"},"base_revision_id":null,"content_type":"text/markdown",
         "created_at":"2026-11-20T10:00:00.000Z","creator":{"type":"agent","agent_id":"agent_1"},"filename":"f",
         "image":null,"parent_revision_id":null,"path":"\(path)","revision_id":"rev_1","revision_number":1,
         "sha256":"0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef","size_bytes":10,
         "stable_url":"https://haus.test/s/acme/files/\(id)","task_id":null,"title":"F",
         "updated_at":"2026-11-20T11:00:00.000Z","version_url":"https://haus.test/s/acme/files/\(id)?v=rev_1"}
        """
        return try HausJSON.decoder().decode(ArtifactRecord.self, from: Data(json.utf8))
    }
}
