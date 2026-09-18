import Foundation
@testable import HausUI
import SwiftUI
import Testing

/// A stored body's edge whitespace is never layout. Agent replies routinely end
/// in a newline, and a `Text` that keeps it paints a blank line under the
/// message — an extra text line of gap before the next row and before the
/// thread card. The presentation boundary trims it once; the stored Markdown is
/// untouched.
struct MessageBodyTrimmingTests {
    @Test func trimsEdgeWhitespaceFromTheBodyAndItsSegments() {
        let message = presentation(content: "  Ready when you are.\n\n")

        #expect(message.content == "Ready when you are.")
        #expect(message.richBlocks == [.paragraph([.text("Ready when you are.")])])
    }

    @Test func keepsInteriorParagraphBreaks() {
        let message = presentation(content: "First paragraph.\n\nSecond paragraph.\n")

        #expect(message.content == "First paragraph.\n\nSecond paragraph.")
    }

    /// The caller that can resolve identities derives the body itself and hands
    /// both in. Trimming must not break that trust check, or a mention loses its
    /// avatar and reverts to the persisted fallback label.
    @Test func keepsResolvedSegmentsWhenTrimmingChangesTheBody() {
        let stored = "Handing this to [@Cove](agent://agt_cove)\n\n"
        let body = MessagePresentation.body(content: stored)
        let resolved = RichMessageBlockParser.blocks(body) { kind, id, _ in
            RichReferencePresentation(
                id: id,
                kind: kind,
                label: "Cove",
                avatarURL: URL(string: "https://example.test/cove.png")
            )
        }

        let message = presentation(content: body, richBlocks: resolved)

        #expect(message.content == "Handing this to [@Cove](agent://agt_cove)")
        guard case let .reference(reference) = message.richBlocks.flatMap(\.segments).last else {
            Issue.record("expected a trailing resolved reference")
            return
        }
        #expect(reference.label == "Cove")
        #expect(reference.avatarURL != nil)
    }

    @Test func trimsTrailingWhitespaceFromAnAuthoredBody() {
        let message = presentation(content: "Meet Tiny.\n")

        #expect(message.content == "Meet Tiny.")
        #expect(message.richBlocks == [.paragraph([.text("Meet Tiny.")])])
    }

    /// The regression itself, measured rather than reasoned about: the rendered
    /// body of "Hello" and of "Hello\n\n" occupy the same height.
    @MainActor
    @Test func rendersTheSameHeightWithAndWithoutTrailingNewlines() {
        let plain = renderedBodyHeight(presentation(content: "Hello"))
        let padded = renderedBodyHeight(presentation(content: "Hello\n\n"))

        #expect(plain != nil)
        #expect(plain == padded)
    }

    @MainActor
    private func renderedBodyHeight(_ message: MessagePresentation) -> Int? {
        let renderer = ImageRenderer(
            content: RichMessageContentView(blocks: message.richBlocks)
                .frame(width: 280, alignment: .leading)
        )
        return renderer.cgImage?.height
    }

    private func presentation(
        content: String,
        richBlocks: [RichMessageBlock]? = nil
    ) -> MessagePresentation {
        MessagePresentation(
            id: "message_1",
            author: MessageAuthorPresentation(id: "agt_cove", name: "Cove", avatarURL: nil),
            content: content,
            createdAt: Date(timeIntervalSince1970: 0),
            richBlocks: richBlocks
        )
    }

}
