import Foundation
import HausModels
@testable import HausUI
import Testing

/// Task references: a written `task://` link chips with its own words. A bare
/// code like `GEN-12` names an Issue and stays text.
@MainActor
struct TaskReferenceChipTests {
    @Test func readsTheWireForm() throws {
        let target = try #require(RichReferenceWireForm.read(target: "task://task_1", text: "Rotate tokens"))
        #expect(target.kind == .task)
        #expect(target.id == "task_1")
    }

    @Test func aChipOpensItsTaskInApp() throws {
        let reference = RichReferencePresentation(id: "task_1", kind: .task, label: "Rotate tokens", avatarURL: nil)
        let url = try #require(reference.activationURL)

        #expect(TaskReferenceTarget(url: url)?.taskID == "task_1")
        #expect(reference.mark == .glyph(.tasks))

        var opened: TaskReferenceTarget?
        InAppReferenceRoutes.openTask = { opened = $0 }
        defer { InAppReferenceRoutes.openTask = nil }
        #expect(InAppReferenceRoutes.handle(url))
        #expect(opened?.taskID == "task_1")
    }

    @Test func aTaskLinkIsNotAMessageOrAnAddress() throws {
        let url = try #require(URL(string: "task://task_1"))
        #expect(MessageReferenceTarget(url: url) == nil)
        #expect(RichReferenceWireForm.activationURL(for: "task://task_1") == nil)
    }

    @Test func aWrittenLinkKeepsItsWords() {
        let segments = RichMessageParser.parse("See [the rate limit](task://task_1).") { _, _, _ in nil }
        let references = chips(segments)

        #expect(references.map(\.label) == ["the rate limit"])
        #expect(references.map(\.kind) == [.task])
    }

    @Test func aBareIssueCodeStaysText() {
        let segments = RichMessageParser.parse("Picked up GEN-12 today.") { _, _, _ in nil }
        #expect(chips(segments).isEmpty)
    }

    private func chips(_ segments: [RichMessageSegment]) -> [RichReferencePresentation] {
        segments.compactMap { segment in
            if case .reference(let reference) = segment { reference } else { nil }
        }
    }
}
