import Foundation
@testable import HausModels
import Testing

/// `artifactMetadataSchema` and `artifactDownloadResultSchema` as the Server
/// sends them.
struct SharedArtifactModelsTests {
    private static func metadata(creator: String) -> String {
        """
        {"artifact_id":"art_1","content_type":"image/png","created_at":"2026-10-01T10:00:00.000Z",
        "creator":\(creator),"filename":"chart.png","name":"chart","revision_id":"rev_2",
        "revision_number":2,"sha256":"\(String(repeating: "a", count: 64))","size_bytes":2048,
        "stable_url":"https://haus.chat/s/acme/artifacts/art_1","title":"Q3 chart",
        "updated_at":"2026-10-12T09:30:00Z","version_url":"https://haus.chat/s/acme/artifacts/art_1?revision=rev_2"}
        """
    }

    @Test func decodesAgentCreatedMetadata() throws {
        let json = #"{"artifact":\#(Self.metadata(creator: #"{"type":"agent","agent_id":"agt_1"}"#))}"#
        let result = try HausJSON.decoder().decode(SharedArtifactResult.self, from: Data(json.utf8))
        let artifact = result.artifact
        #expect(artifact.artifactID == "art_1")
        #expect(artifact.creator == .agent(id: "agt_1"))
        #expect(artifact.title == "Q3 chart")
        #expect(artifact.revisionID == "rev_2")
        #expect(artifact.revisionNumber == 2)
        #expect(artifact.sizeBytes == 2048)
        #expect(artifact.fileKind == .image)
        #expect(artifact.createdAt == HausISO8601.date(from: "2026-10-01T10:00:00.000Z"))
        #expect(artifact.updatedAt == HausISO8601.date(from: "2026-10-12T09:30:00Z"))
    }

    @Test func decodesAMemberCreatorAndADownloadLink() throws {
        let json = """
        {"artifact":\(Self.metadata(creator: #"{"type":"user","user_id":"usr_1"}"#)),
        "download_url":"https://storage.example/obj?sig=1","expires_at":"2026-10-12T09:35:00Z"}
        """
        let download = try HausJSON.decoder().decode(SharedArtifactDownload.self, from: Data(json.utf8))
        #expect(download.artifact.creator == .user(id: "usr_1"))
        #expect(download.downloadURL == URL(string: "https://storage.example/obj?sig=1"))
    }

    @Test func rejectsACreatorItCannotName() {
        let json = #"{"artifact":\#(Self.metadata(creator: #"{"type":"bot","bot_id":"b"}"#))}"#
        #expect(throws: DecodingError.self) {
            try HausJSON.decoder().decode(SharedArtifactResult.self, from: Data(json.utf8))
        }
    }

    @Test func encodesTheTargetInputTheRouterValidates() throws {
        let pinned = SharedArtifactTargetInput(
            target: SharedArtifactLinkTarget(artifactID: "art_1", revisionID: "rev_2"), serverID: "srv_1", save: false
        )
        let current = SharedArtifactTargetInput(target: SharedArtifactLinkTarget(artifactID: "art_1"), serverID: "srv_1")
        let encoder = JSONEncoder()
        encoder.outputFormatting = .sortedKeys
        #expect(String(decoding: try encoder.encode(pinned), as: UTF8.self)
            == #"{"artifact_id":"art_1","revision_id":"rev_2","save":false,"serverId":"srv_1"}"#)
        #expect(String(decoding: try encoder.encode(current), as: UTF8.self)
            == #"{"artifact_id":"art_1","serverId":"srv_1"}"#)
    }

    @Test(arguments: [
        ("image/png", "a.png", SharedArtifactFileKind.image),
        ("application/octet-stream", "a.JPG", .image),
        ("image/svg+xml", "a.svg", .document),
        ("video/mp4", "a.mp4", .video),
        ("audio/mpeg", "a.mp3", .audio),
        ("text/html; charset=utf-8", "a.html", .html),
        ("application/pdf", "a.pdf", .pdf),
        ("text/markdown", "notes.md", .document),
        ("text/csv", "data.csv", .document),
    ])
    func readsTheFileKind(contentType: String, filename: String, kind: SharedArtifactFileKind) {
        #expect(SharedArtifactFileKind(contentType: contentType, filename: filename) == kind)
    }
}
