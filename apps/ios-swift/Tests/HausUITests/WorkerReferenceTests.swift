import Foundation
import HausModels
@testable import HausUI
import Testing

/// `[<title>](worker://<workId>)` reads as a quiet Cloud Agent work chip
/// labelled with the unescaped title (ADR 0044).
@MainActor
struct WorkerReferenceTests {
    @Test func theWireFormReadsWorkerByItsId() throws {
        let target = try #require(RichReferenceWireForm.read(target: "worker://caw%2F1", text: #"Open \[draft"#))
        #expect(target.kind == .cloudAgentWork)
        #expect(target.id == "caw/1")
        #expect(target.label == "Open [draft")
        #expect(RichReferenceWireForm.read(target: "worker://", text: "x") == nil)
    }

    @Test func aWorkLinkIsAQuietChipLabelledWithItsTitle() throws {
        let segments = RichMessageParser.parse(#"Moved here: [#12 C:\\fix](worker://caw_1)."#) { _, _, _ in nil }
        let reference = try #require(segments.compactMap { segment -> RichReferencePresentation? in
            if case .reference(let reference) = segment { reference } else { nil }
        }.first)
        #expect(reference.kind == .cloudAgentWork)
        #expect(reference.id == "caw_1")
        // A title keeps its leading `#`: no sigil is stripped from it.
        #expect(reference.label == #"#12 C:\fix"#)
        #expect(reference.mark == .glyph(.cloud))
        #expect(reference.activationURL == nil)
    }

}
