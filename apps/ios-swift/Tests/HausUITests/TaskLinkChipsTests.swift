import Foundation
import HausModels
@testable import HausUI
import Testing

/// Task references: a written `task://` link, and a bare key the Server
/// resolved without touching the content.
@MainActor
struct TaskLinkChipsTests {
    private let link = TaskLink(key: "SEC-12", taskID: "task_1", text: "SEC-12")

    @Test func readsTheWireForm() throws {
        let target = try #require(RichReferenceWireForm.read(target: "task://task_1", text: "SEC-12"))
        #expect(target.kind == .task)
        #expect(target.id == "task_1")
    }

    @Test func aChipOpensItsTaskInApp() throws {
        let reference = RichReferencePresentation(id: "task_1", kind: .task, label: "SEC-12", avatarURL: nil)
        let url = try #require(reference.activationURL)

        #expect(TaskReferenceTarget(url: url)?.taskID == "task_1")
        #expect(reference.mark == .glyph(.tasks))

        var opened: TaskReferenceTarget?
        InAppReferenceRoutes.openTask = { opened = $0 }
        defer { InAppReferenceRoutes.openTask = nil }
        #expect(InAppReferenceRoutes.handle(url))
        #expect(opened?.taskID == "task_1")
    }

    @Test func aTaskLinkIsNotAThreadOrAnAddress() throws {
        let url = try #require(URL(string: "task://task_1"))
        #expect(ThreadReferenceTarget(url: url) == nil)
        #expect(RichReferenceWireForm.activationURL(for: "task://task_1") == nil)
    }

    @Test func aWrittenLinkKeepsItsWords() {
        let segments = RichMessageParser.parse("See [the rate limit](task://task_1).") { _, _, _ in nil }
        let references = chips(segments)

        #expect(references.map(\.label) == ["the rate limit"])
        #expect(references.map(\.kind) == [.task])
    }

    @Test func chipsABareKeyInProse() throws {
        let segments = applied("Does SEC-12 cover GitHub Triggers?")

        #expect(segments == [
            .text("Does "),
            .reference(RichReferencePresentation(id: "task_1", kind: .task, label: "SEC-12", avatarURL: nil)),
            .text(" cover GitHub Triggers?"),
        ])
    }

    @Test func chipsEveryOccurrenceAndKeepsTheWordsAround() {
        let references = chips(applied("SEC-12, then SEC-12."))
        #expect(references.count == 2)
    }

    /// A re-keyed board re-keys its Tasks; the Message keeps its words.
    @Test func aChipReadsTheCurrentKey() {
        let rekeyed = TaskLink(key: "SAFE-12", taskID: "task_1", text: "SEC-12")
        let blocks = TaskLinkChips.apply(
            [rekeyed],
            to: RichMessageBlockParser.blocks("See SEC-12") { _, _, _ in nil }
        )

        #expect(chips(blocks.flatMap(\.segments)).map(\.label) == ["SAFE-12"])
    }

    @Test func leavesWhatTheServerDidNotResolve() {
        let segments = applied("UTF-8 and SEC-99 are not tasks.")
        #expect(chips(segments).isEmpty)
    }

    @Test func leavesCodeAndLinksAlone() {
        #expect(chips(applied("Run `SEC-12` now")).isEmpty)
        #expect(chips(applied("[the docs](https://haus.dev/SEC-12)")).allSatisfy { $0.kind != .task })
        #expect(chips(applied("https://haus.dev/tasks/SEC-12")).allSatisfy { $0.kind != .task })

        let code = TaskLinkChips.apply(
            [link],
            to: RichMessageBlockParser.blocks("```\nSEC-12\n```") { _, _, _ in nil }
        )
        #expect(code == [.code(language: nil, text: "SEC-12")])
    }

    @Test func aKeyInsideALongerWordIsNotAKey() {
        #expect(chips(applied("XSEC-12 and SEC-123 and SEC-12-b and a/SEC-12")).isEmpty)
    }

    @Test func reachesListsQuotesAndTables() {
        let list = applied("- SEC-12 is open")
        #expect(chips(list).map(\.label) == ["SEC-12"])

        let quote = applied("> SEC-12 is open")
        #expect(chips(quote).map(\.label) == ["SEC-12"])

        let table = applied("| Task |\n| --- |\n| SEC-12 |")
        #expect(chips(table).map(\.label) == ["SEC-12"])
    }

    @Test func noLinksLeavesTheBlocksAsParsed() {
        let blocks = RichMessageBlockParser.blocks("SEC-12") { _, _, _ in nil }
        #expect(TaskLinkChips.apply([], to: blocks) == blocks)
    }

    private func applied(_ content: String) -> [RichMessageSegment] {
        TaskLinkChips
            .apply([link], to: RichMessageBlockParser.blocks(content) { _, _, _ in nil })
            .flatMap(\.segments)
    }

    private func chips(_ segments: [RichMessageSegment]) -> [RichReferencePresentation] {
        segments.compactMap { segment in
            if case .reference(let reference) = segment { reference } else { nil }
        }
    }
}
