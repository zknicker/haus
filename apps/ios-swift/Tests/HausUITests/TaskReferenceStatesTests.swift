import CoreGraphics
import Foundation
import HausModels
import Testing
@testable import HausUI

@MainActor
@Suite("Task references wear their state")
struct TaskReferenceStatesTests {
    private func blocks(_ content: String, links: [TaskLink] = []) -> [RichMessageBlock] {
        TaskLinkChips.apply(links, to: RichMessageBlockParser.blocks(content) { _, _, _ in nil })
    }

    private func taskReferences(_ blocks: [RichMessageBlock]) -> [RichReferencePresentation] {
        blocks.flatMap { block -> [RichReferencePresentation] in
            switch block {
            case .paragraph(let segments):
                segments.compactMap { if case .reference(let reference) = $0 { reference } else { nil } }
            case .list(let items):
                items.flatMap { $0.segments }.compactMap { if case .reference(let reference) = $0 { reference } else { nil } }
            default:
                []
            }
        }
        .filter { $0.kind == .task }
    }

    @Test("Written links and bare keys the Server resolved are both Task references")
    func findsEveryTaskReference() {
        let body = blocks(
            "Picked up [SEC-12](task://task_12) and SEC-14.\n\n- also [SEC-15](task://task_15)",
            links: [TaskLink(key: "SEC-14", taskID: "task_14", text: "SEC-14")]
        )
        #expect(TaskReferenceStates.taskIDs(in: body) == ["task_12", "task_14", "task_15"])
    }

    @Test("A Task the app holds wears its state disc; one it has no read of keeps the Tasks glyph")
    func stampsKnownStates() {
        let body = blocks("[SEC-12](task://task_12) then [SEC-13](task://task_13)")
        let stamped = taskReferences(TaskReferenceStates.apply(["task_12": .done], to: body))

        #expect(stamped.map(\.mark) == [.taskState(.done), .glyph(.tasks)])
        #expect(stamped.map(\.label) == ["SEC-12", "SEC-13"])
    }

    @Test("A new state restamps a chip that already wore one")
    func restamps() {
        let body = blocks("[SEC-12](task://task_12)")
        let open = TaskReferenceStates.apply(["task_12": .open], to: body)
        let done = TaskReferenceStates.apply(["task_12": .done], to: open)
        #expect(taskReferences(done).map(\.mark) == [.taskState(.done)])
    }

    @Test("The inline disc keeps TaskStateDisc's geometry")
    func discGeometry() throws {
        let rect = CGRect(x: 0, y: 0, width: 16, height: 16)
        #expect(RichReferenceTaskDisc(state: .todo, in: rect).mark == .ring)
        #expect(RichReferenceTaskDisc(state: .unknown, in: rect).mark == .ring)
        #expect(RichReferenceTaskDisc(state: .open, in: rect).mark == .halfFilled)
        #expect(RichReferenceTaskDisc(state: .canceled, in: rect).glyphStrokes.count == 2)

        let done = RichReferenceTaskDisc(state: .done, in: CGRect(x: 10, y: 20, width: 32, height: 32))
        #expect(done.ring.rect == CGRect(x: 14, y: 24, width: 24, height: 24))
        #expect(done.closedDisc.width == 27)
        let start = try #require(done.glyphStrokes.first?.first)
        #expect(abs(start.x - 20.2) < 0.001 && abs(start.y - 36.6) < 0.001)
    }
}

@MainActor
@Suite("Drive references open natively")
struct DriveReferenceRouteTests {
    @Test("A library link the App knows opens its Drive file")
    func opensDriveFile() throws {
        let url = try #require(SharedArtifactLinkTarget(key: "art_1")?.inAppURL)
        var opened: SharedArtifactLinkTarget?
        InAppReferenceRoutes.openDriveArtifact = { target in { opened = target } }
        defer { InAppReferenceRoutes.openDriveArtifact = nil }

        #expect(InAppReferenceRoutes.handle(url))
        #expect(opened == SharedArtifactLinkTarget(artifactID: "art_1"))
    }

    @Test("A library link the App cannot place still opens in the artifact viewer")
    func fallsBackToTheViewer() throws {
        let url = try #require(SharedArtifactLinkTarget(key: "art_1@rev_2")?.inAppURL)
        InAppReferenceRoutes.openDriveArtifact = { _ in nil }
        defer { InAppReferenceRoutes.openDriveArtifact = nil }

        #expect(InAppReferenceRoutes.action(for: url) != nil)
    }
}
