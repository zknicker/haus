import Foundation
import HausModels
@testable import HausUI
import Testing

/// `[<title>](cloud-agent://<workId>)` reads as a quiet Cloud Agent work chip
/// labelled with the unescaped title (ADR 0044).
@MainActor
struct CloudAgentWorkReferenceTests {
    @Test func theWireFormReadsCloudAgentWorkByItsId() throws {
        let target = try #require(RichReferenceWireForm.read(target: "cloud-agent://caw%2F1", text: #"Open \[draft"#))
        #expect(target.kind == .cloudAgentWork)
        #expect(target.id == "caw/1")
        #expect(target.label == "Open [draft")
        #expect(RichReferenceWireForm.read(target: "cloud-agent://", text: "x") == nil)
    }

    @Test func aWorkLinkIsAQuietChipLabelledWithItsTitle() throws {
        let segments = RichMessageParser.parse(#"Moved here: [#12 C:\\fix](cloud-agent://caw_1)."#) { _, _, _ in nil }
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

    @Test func aThreadChipNamesItsAnchorByTheFirstLinkedWork() {
        #expect(ThreadReferenceTarget.title(anchorContent: "On it.\n\n[x](cloud-agent://caw_1)", workTitle: "Fix the flaky test")
            == "Fix the flaky test")
        #expect(ThreadReferenceTarget.title(anchorContent: "On it.", workTitle: nil) == "On it.")
    }

    @Test func aMessageCardListsEveryLinkedWorkOnceAboveTheThreadPreview() throws {
        let own = try CloudAgentWorkFixture.work(id: "work-1").work
        let encoded = String(decoding: try HausJSON.encoder().encode(own), as: UTF8.self)
        let second = encoded.replacingOccurrences(of: #""id":"work-1""#, with: #""id":"work-2""#)
        let third = encoded.replacingOccurrences(of: #""id":"work-1""#, with: #""id":"work-3""#)
        let rows = try HausJSON.decoder().decode([ThreadCloudAgentWork].self, from: Data("""
        [{"anchorMessageId":"m_1","work":\(encoded)},
         {"anchorMessageId":"m_1","work":\(second)},
         {"anchorMessageId":"m_1","work":\(third)}]
        """.utf8))
        let listed = CloudAgentPresentation.threadPreviewWork(rows, anchorMessageID: "m_1", ownWorkIDs: ["work-1", "work-2"])
        #expect(listed.map(\.id) == ["work-3"])
    }
}
