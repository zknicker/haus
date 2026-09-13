import Testing
@testable import HausUI

/// What the answer card under an open Ask offers, and how far one answer gets.
@Suite struct AskAnswerCardTests {
    /// The Agent's order is the reader's order, and the recommendation is the
    /// first option it wrote — the one drawn prominent.
    @Test func offersTheOptionsInTheOrderTheAgentWroteThem() {
        let options = AskOptions(["Yes, rename it", "Keep #product", "Not now"])

        #expect(options.isOffered)
        #expect(options.options == ["Yes, rename it", "Keep #product", "Not now"])
        #expect(options.isRecommendation(0))
        #expect(!options.isRecommendation(1))
        #expect(!options.isRecommendation(2))
    }

    /// An Ask with no options is an open question: the composer below is the
    /// whole answer, so the card offers no buttons at all.
    @Test func offersNothingForAnOpenQuestion() {
        let options = AskOptions([])

        #expect(!options.isOffered)
        #expect(options.answer(at: 0) == nil)
    }

    /// The card points at the composer either way, but says a different thing:
    /// with buttons free text is the other way out, and without them it is the
    /// only one.
    @Test func pointsAtTheComposerForFreeText() {
        #expect(AskOptions(["Friday", "Monday"]).freeTextHint == "Or write a reply below.")
        #expect(AskOptions([]).freeTextHint == "Write your answer below.")
    }

    /// Pressing an option and typing the same words are the same Message, so
    /// nothing decorates the text an option sends.
    @Test func sendsTheOptionTextVerbatim() {
        let options = AskOptions(["Keep #product, pin a note instead"])

        #expect(options.answer(at: 0) == "Keep #product, pin a note instead")
        #expect(options.answer(at: 1) == nil)
    }

    /// One press spends the whole card: the Ask leaves on its own refetch, and
    /// until it does a second press would only post a second answer.
    @Test func spendsTheCardWhileAnAnswerIsInFlightAndOnceItLands() {
        #expect(!AskAnswerPress.idle.isSpent)
        #expect(AskAnswerPress.sending.isSpent)
        #expect(AskAnswerPress.answered.isSpent)
    }

    /// A send that failed spends nothing — the reader still has a decision to
    /// make — and the card says so rather than swallowing it.
    @Test func statesAFailedSendInTheCard() {
        #expect(!AskAnswerCard.failureText.isEmpty)
        #expect(!AskAnswerPress.idle.isSpent)
    }
}
