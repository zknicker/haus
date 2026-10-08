@testable import HausUI
import Foundation
import Testing

struct SearchHighlightTests {
    @Test func findsEveryMatchIgnoringCaseAndDiacritics() {
        let text = "Café plans: the cafe opens, CAFE closes."
        let matches = SearchHighlight.ranges(of: "cafe", in: text).map { String(text[$0]) }

        #expect(matches == ["Café", "cafe", "CAFE"])
    }

    @Test func aBlankTermMatchesNothing() {
        #expect(SearchHighlight.ranges(of: "  ", in: "anything").isEmpty)
    }

    @Test func marksTheMatchedRunsInTheAttributedText() {
        let attributed = SearchHighlight.attributed("Ship the deploy, then deploy again", term: "deploy")
        let marked = attributed.runs
            .filter { $0.inlinePresentationIntent == .stronglyEmphasized }
            .map { String(attributed[$0.range].characters) }

        #expect(marked == ["deploy", "deploy"])
    }

    @Test func keepsAnEarlyMatchInTheWholeMessage() {
        let text = "Deploy is green.\nNothing else to report."

        #expect(SearchHighlight.excerpt(text, term: "deploy") == "Deploy is green. Nothing else to report.")
    }

    @Test func startsALateMatchsExcerptAtAWordShortlyBeforeIt() {
        let text = "We talked through the onboarding checklist for a long while and then finally the deploy went out."

        let excerpt = SearchHighlight.excerpt(text, term: "deploy")

        #expect(excerpt.hasPrefix("…"))
        #expect(excerpt.hasSuffix("the deploy went out."))
        let lead = excerpt.dropFirst().prefix { $0 != " " }
        #expect(text.contains(" \(lead) "))
    }
}
