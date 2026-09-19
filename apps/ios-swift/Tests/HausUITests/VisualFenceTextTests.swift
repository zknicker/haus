import Foundation
@testable import HausUI
import Testing

/// What a visual is called, as opposed to where its fence sits. Every case here
/// was verified against `visualFallbackText` in `packages/haus-api/src/widgets/
/// visual/contracts.ts`; the JavaScript output is the contract, not the prose
/// description of it.
struct VisualFenceTextTests {
    @Test func fallbackPrefersTheExplicitTitle() {
        #expect(VisualFence.fallbackText(html: "<h2>Ranked</h2>", title: "Chart") == "Chart")
    }

    @Test func fallbackUsesTheDocumentTitleNext() {
        #expect(
            VisualFence.fallbackText(html: "<title>Doc title</title><h1>Heading</h1>", title: nil)
                == "Doc title"
        )
    }

    @Test func fallbackUsesTheFirstHeadingWithInnerTagsStripped() {
        #expect(
            VisualFence.fallbackText(html: "<h3><em>Ranked</em> teams</h3>", title: nil)
                == "Ranked teams"
        )
        #expect(
            VisualFence.fallbackText(html: "<h2>Multi\n  line   text</h2>", title: nil)
                == "Multi line text"
        )
    }

    @Test func fallbackSkipsAWhitespaceOnlyTitleTag() {
        #expect(
            VisualFence.fallbackText(html: "<title>   </title><h1>Heading</h1>", title: nil)
                == "Heading"
        )
    }

    @Test func fallbackIgnoresAWhitespaceOnlyExplicitTitle() {
        #expect(VisualFence.fallbackText(html: "<p>x</p>", title: "   ") == "Visual")
    }

    @Test func fallbackIsGenericWhenNothingNamesTheVisual() {
        #expect(
            VisualFence.fallbackText(html: #"<svg viewBox="0 0 10 10"></svg>"#, title: nil)
                == "Visual"
        )
    }

    @Test func fallbackMatchesTagsCaseInsensitively() {
        #expect(VisualFence.fallbackText(html: #"<TITLE class="a">Upper</TITLE>"#, title: nil) == "Upper")
    }

    @Test func fallbackCapsTextAtFiveHundredCharacters() {
        let longHeading = "<h1>\(String(repeating: "a", count: 600))</h1>"

        #expect(VisualFence.fallbackText(html: longHeading, title: nil).count == 500)
        #expect(
            VisualFence.fallbackText(html: "<p>x</p>", title: String(repeating: "z", count: 600))
                .count == 500
        )
    }
}
