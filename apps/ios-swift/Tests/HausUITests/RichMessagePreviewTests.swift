import Foundation
@testable import HausUI
import Testing

/// A one-line preview is the message as a sidebar or thread card reads it. A
/// visual fence has no prose to show, so it reads as the visual's name — never
/// as the raw markup the model authored.
struct RichMessagePreviewTests {
    @Test func previewsAVisualOnlyMessageAsItsTitle() {
        let preview = RichMessageParser.oneLinePreview(
            "```visual Weekly sales\n<h1>Sales</h1>\n<svg></svg>\n```"
        )

        #expect(preview == "Weekly sales")
    }

    @Test func previewsAnUntitledVisualAsItsDocumentTitle() {
        let preview = RichMessageParser.oneLinePreview(
            "```visual\n<title>Q3 revenue</title><h1>Heading</h1>\n```"
        )

        #expect(preview == "Q3 revenue")
    }

    @Test func previewsAVisualWithNoTitleAsItsFirstHeading() {
        let preview = RichMessageParser.oneLinePreview("```visual\n<h2>Ranked teams</h2>\n```")

        #expect(preview == "Ranked teams")
    }

    @Test func previewsAnAnonymousVisualGenerically() {
        let preview = RichMessageParser.oneLinePreview(
            "```visual\n<svg viewBox=\"0 0 10 10\"></svg>\n```"
        )

        #expect(preview == "Visual")
    }

    @Test func previewsProseAroundAFenceAsOneLine() {
        let preview = RichMessageParser.oneLinePreview(
            "Here you go:\n```visual Weekly sales\n<h1>Sales</h1>\n```\nDone."
        )

        #expect(preview == "Here you go: Weekly sales Done.")
    }

    @Test func previewsAStreamingVisualBeforeItCloses() {
        let preview = RichMessageParser.oneLinePreview("Drawing.\n```visual Sales\n<div><h2>Part")

        #expect(preview == "Drawing. Sales")
    }

    @Test func leavesAMessageWithoutFencesUntouched() {
        let preview = RichMessageParser.oneLinePreview("Ship it.\nTomorrow, ideally.")

        #expect(preview == "Ship it. Tomorrow, ideally.")
    }
}

/// The two preview surfaces that render a message body without the transcript's
/// fence split: a Server search result, and a claim row's one-line title.
struct MessagePreviewSurfaceTests {
    private let fenced = "Shipped it.\n```visual Weekly sales\n<h1>Sales</h1>\n<svg></svg>\n```"

    @Test func searchResultsReadAVisualsNameRatherThanItsMarkup() {
        let result = MessageSearchResultPresentation(
            id: "search_1",
            authorName: "Cove",
            chatID: "chat_1",
            chatName: "product",
            content: fenced,
            createdAt: .now
        )

        #expect(result.content == "Shipped it.\nWeekly sales")
        #expect(!result.content.contains("<h1>"))
        #expect(!result.content.contains("```"))
    }

    @Test func searchResultsLeaveAMessageWithoutFencesUntouched() {
        let result = MessageSearchResultPresentation(
            id: "search_2",
            authorName: "Cove",
            chatID: "chat_1",
            chatName: "product",
            content: "Ship it.\nTomorrow, ideally.",
            createdAt: .now
        )

        #expect(result.content == "Ship it.\nTomorrow, ideally.")
    }

    /// The claim row is one line, so its anchor collapses to one — and a claim
    /// whose anchor is a visual reads as the visual's name.
    @Test func aClaimTitleCollapsesToOneLineAndNamesItsVisual() {
        #expect(RichMessageParser.oneLinePreview(fenced) == "Shipped it. Weekly sales")
    }
}
