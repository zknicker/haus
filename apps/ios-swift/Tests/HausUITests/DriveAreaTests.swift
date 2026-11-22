import Foundation
import HausModels
import Testing
@testable import HausUI

struct DriveAreaTests {
    @Test(arguments: [
        ("haus/AGENTS.md", DriveArea.haus),
        ("haus", .haus),
        ("projects/product/duo-layouts.html", .project(key: "product")),
        ("projects/product", .project(key: "product")),
        ("agents/blippy/notes/today.md", .agent(handle: "blippy")),
    ])
    func pathsMapToTheirAreaByPrefix(path: String, area: DriveArea) {
        #expect(DriveArea(path: path) == area)
    }

    @Test(arguments: ["projects", "agents", "notes/a.md", ""])
    func pathsOutsideEveryAreaHaveNone(path: String) {
        #expect(DriveArea(path: path) == nil)
    }

    @Test func areaLabelsAreTheirFolder() {
        #expect(DriveArea.haus.path == "haus")
        #expect(DriveArea.project(key: "product").path == "projects/product")
        #expect(DriveArea.agent(handle: "tiny").path == "agents/tiny")
    }

    @Test func groupingOrdersRootThenHausThenProjectsThenCaptainsAndKeepsListedOrder() {
        let paths = [
            "agents/tiny/a.md",
            "projects/zeta/b.md",
            "haus/c.md",
            "projects/alpha/d.md",
            "agents/blippy/e.md",
            "projects/zeta/f.md",
            "projects",
        ]
        let sections = DriveAreaSection.group(paths) { $0 }
        #expect(sections.map(\.title) == [
            "Drive", "haus", "projects/alpha", "projects/zeta", "agents/blippy", "agents/tiny",
        ])
        #expect(sections[3].items == ["projects/zeta/b.md", "projects/zeta/f.md"])
    }
}

struct DriveFilePreviewChoiceTests {
    @Test(arguments: [
        ("text/html", "duo-layouts.html", DriveFilePreviewChoice.page),
        ("application/octet-stream", "page.htm", .page),
        ("text/markdown", "release-28.1.md", .text(monospaced: false)),
        ("text/plain", "notes.txt", .text(monospaced: false)),
        ("application/json", "config.json", .text(monospaced: true)),
        ("application/octet-stream", "router.swift", .text(monospaced: true)),
        ("text/csv; charset=utf-8", "sales.csv", .text(monospaced: true)),
        ("image/png", "shot.png", .file),
        ("image/svg+xml", "logo.svg", .file),
        ("application/pdf", "brief.pdf", .file),
        ("application/vnd.openxmlformats-officedocument.wordprocessingml.document", "plan.docx", .file),
    ])
    func choosesThePreviewByKind(contentType: String, filename: String, choice: DriveFilePreviewChoice) {
        #expect(DriveFilePreviewChoice(contentType: contentType, filename: filename) == choice)
    }

    @Test func onlyTheFileChoiceSkipsTheTextRead() {
        #expect(DriveFilePreviewChoice.page.readsText)
        #expect(DriveFilePreviewChoice.text(monospaced: true).readsText)
        #expect(!DriveFilePreviewChoice.file.readsText)
    }

    @Test func fileRowReadsFolderAuthorAndAge() throws {
        let file = DriveFilePresentation(record: try DriveFixture.record(path: "projects/product/duo-layouts.html"), authorName: "Tiny")
        let now = DriveFixture.updatedAt.addingTimeInterval(20 * 60)
        #expect(file.folder == "projects/product")
        #expect(file.metaPieces(now: now) == ["projects/product", "Tiny", "20m"])
        #expect(file.preview == .page)
    }
}

enum DriveFixture {
    static let updatedAt = Date(timeIntervalSince1970: 1_790_000_000)

    static func record(path: String, contentType: String = "text/html") throws -> ArtifactRecord {
        let filename = String(path.split(separator: "/").last ?? "")
        let at = HausISO8601.string(from: updatedAt)
        let json = """
        {"artifact_id":"art_1","content_type":"\(contentType)","created_at":"\(at)",
         "creator":{"type":"agent","agent_id":"agt_tiny"},"filename":"\(filename)","path":"\(path)",
         "revision_id":"rev_1","revision_number":3,"size_bytes":120,"stable_url":"https://haus.test/a/art_1",
         "title":"\(filename)","updated_at":"\(at)","sha256":"\(String(repeating: "a", count: 64))",
         "version_url":"https://haus.test/a/art_1/rev_1","author":{"type":"agent","agent_id":"agt_tiny"},
         "base_revision_id":null,"image":null,"parent_revision_id":null,"task_id":null}
        """
        return try HausJSON.decoder().decode(ArtifactRecord.self, from: Data(json.utf8))
    }
}
