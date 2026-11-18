import Foundation
import HausModels
@testable import HausUI
import Testing

/// A stored link that still names a side conversation by its anchor opens
/// that Message in its Channel (ADR 0052).
@MainActor
struct MessageReferenceTargetTests {
    private let wire = "chat://cht_product\(MessageReferenceTarget.legacyMessageParameter)msg_anchor"

    @Test func readsTheChannelAndMessageFromTheLegacyForm() {
        #expect(MessageReferenceTarget(wireTarget: wire) == MessageReferenceTarget(
            chatID: "cht_product",
            messageID: "msg_anchor"
        ))
        #expect(MessageReferenceTarget(wireTarget: "chat://cht_product") == nil)
        #expect(MessageReferenceTarget(wireTarget: "\(wire)&x=1") == nil)
    }

    @Test func aTappedChipRoutesToItsChannelAtTheMessage() throws {
        let url = try #require(URL(string: wire))
        var opened: MessageReferenceTarget?
        InAppReferenceRoutes.openMessage = { opened = $0 }
        defer { InAppReferenceRoutes.openMessage = nil }

        #expect(InAppReferenceRoutes.handle(url))
        #expect(opened == MessageReferenceTarget(chatID: "cht_product", messageID: "msg_anchor"))
    }

    @Test func theChipKeepsTheLinksOwnWords() throws {
        let segments = RichMessageParser.parse("See [the launch plan](\(wire)).") { _, _, _ in nil }
        let reference = try #require(segments.compactMap { segment -> RichReferencePresentation? in
            if case .reference(let reference) = segment { reference } else { nil }
        }.first)
        #expect(reference.kind == .message)
        #expect(reference.id == wire)
        #expect(reference.label == "the launch plan")
    }
}
