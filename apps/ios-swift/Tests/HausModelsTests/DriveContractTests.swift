import Foundation
import XCTest
@testable import HausModels

final class DriveContractTests: XCTestCase {
    private func record(author: String = #"{"type":"agent","agent_id":"agent_1"}"#) -> String {
        """
        {"artifact_id":"art_1","author":\(author),"base_revision_id":null,"content_type":"image/png",
         "created_at":"2026-11-20T10:00:00.000Z","creator":{"type":"agent","agent_id":"agent_1"},"filename":"chart.png",
         "image":{"dpi":null,"height":600,"width":800},"parent_revision_id":"rev_0","path":"reports/chart.png",
         "revision_id":"rev_1","revision_number":2,
         "sha256":"0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef","size_bytes":2048,
         "stable_url":"https://haus.test/s/acme/files/art_1","task_id":"task_12","title":"Chart",
         "updated_at":"2026-11-20T11:00:00.000Z","version_url":"https://haus.test/s/acme/files/art_1?v=rev_1"}
        """
    }

    func testEveryDriveProcedureNamesItsServerPath() {
        XCTAssertEqual(DriveProcedures.list.path, "artifact.list")
        XCTAssertEqual(DriveProcedures.byPath.path, "artifact.byPath")
        XCTAssertEqual(DriveProcedures.text.path, "artifact.text")
        XCTAssertEqual(DriveProcedures.download.path, "artifact.download")
        XCTAssertEqual(DriveProcedures.download.kind, .query)
    }

    func testTheLibraryPageDecodesRecordsFoldersAndPublicLinks() throws {
        let page = try ContractFixtures.decode(ArtifactLibraryPage.self, """
        {"artifacts":[\(record())],"folders":[{"file_count":3,"name":"reports","path":"reports",
          "updated_at":"2026-11-20T11:00:00.000Z"}],"next_offset":null,
         "public_links":{"art_1":{"can_disable":true,"created_at":"2026-11-20T11:00:00.000Z",
           "creator":{"type":"user","user_id":"user_1"},"url":"https://haus.test/p/abc"}},
         "summary":{"files":1,"files_in_folders":3,"folders":1}}
        """)
        let artifact = try XCTUnwrap(page.artifacts.first)
        XCTAssertEqual(artifact.author, .agent(id: "agent_1"))
        XCTAssertEqual(artifact.metadata.revisionNumber, 2)
        XCTAssertEqual(artifact.image?.width, 800)
        XCTAssertEqual(artifact.taskID, "task_12")
        XCTAssertEqual(page.folders.first?.fileCount, 3)
        XCTAssertEqual(page.publicLinks["art_1"]?.creator, .user(id: "user_1"))
        XCTAssertEqual(page.summary.filesInFolders, 3)
        XCTAssertNil(page.nextOffset)
    }

    func testARecordWithAnUnknownAuthorOrBadHashFails() throws {
        let haus = record(author: #"{"type":"haus"}"#)
        XCTAssertEqual(try ContractFixtures.decode(ArtifactRecordResult.self, "{\"artifact\":\(haus)}").artifact.author, .haus)
        XCTAssertThrowsError(try ContractFixtures.decode(ArtifactRecord.self, record(author: #"{"type":"robot"}"#)))
        XCTAssertThrowsError(try ContractFixtures.decode(ArtifactRecord.self, record().replacingOccurrences(of: "0123456789abcdef0123", with: "XYZ")))
    }

    func testTextReadsDecodeEachAnswer() throws {
        XCTAssertEqual(try ContractFixtures.decode(ArtifactTextResult.self, ##"{"status":"text","text":"# Notes"}"##), .text("# Notes"))
        XCTAssertEqual(try ContractFixtures.decode(ArtifactTextResult.self, #"{"limit_bytes":1048576,"status":"too_large"}"#), .tooLarge(limitBytes: 1_048_576))
        XCTAssertEqual(try ContractFixtures.decode(ArtifactTextResult.self, #"{"status":"binary"}"#), .binary)
        XCTAssertThrowsError(try ContractFixtures.decode(ArtifactTextResult.self, #"{"status":"maybe"}"#))
    }

    func testDriveInputsSendTheirExactShapes() throws {
        let list = try XCTUnwrap(ArtifactListInput(
            serverID: "server_1", creator: .agent(id: "agent_1"), kind: .images, direction: .desc, prefix: "reports"
        ))
        XCTAssertEqual(try ContractFixtures.encoded(list), try ContractFixtures.object("""
        {"creator":{"agent_id":"agent_1","type":"agent"},"direction":"desc","kind":"images","limit":50,"offset":0,
         "order":"updated","prefix":"reports","query":"","recursive":false,"serverId":"server_1"}
        """))
        XCTAssertNil(ArtifactListInput(serverID: "s", limit: 201))
        let byPath = try XCTUnwrap(ArtifactByPathInput(path: "reports/chart.png", serverID: "server_1"))
        XCTAssertEqual(try ContractFixtures.encoded(byPath), try ContractFixtures.object(
            #"{"path":"reports/chart.png","serverId":"server_1"}"#
        ))
        XCTAssertNil(ArtifactByPathInput(path: "", serverID: "s"))
        let text = ArtifactTextInput(artifactID: "art_1", revisionID: "rev_1", serverID: "server_1")
        XCTAssertEqual(try ContractFixtures.encoded(text), try ContractFixtures.object(
            #"{"artifact_id":"art_1","revision_id":"rev_1","serverId":"server_1"}"#
        ))
    }

    func testTheArtifactStreamNamesOneFileOrMany() throws {
        XCTAssertEqual(try ContractFixtures.decode(ArtifactUpdatedEvent.self, #"{"artifactId":"art_1","serverId":"server_1"}"#).artifactID, "art_1")
        XCTAssertNil(try ContractFixtures.decode(ArtifactUpdatedEvent.self, #"{"artifactId":null,"serverId":"server_1"}"#).artifactID)
        XCTAssertEqual(RealtimeStream.artifactUpdated.path, "artifact.onUpdated")
        XCTAssertTrue(RealtimeStream.liveSession.contains(.artifactUpdated))
        XCTAssertEqual(RealtimeStream.artifactUpdated.ownedProjections, [.driveListings, .driveFiles])
        XCTAssertFalse(RealtimeStream.artifactUpdated.reportsOutage)
    }
}
