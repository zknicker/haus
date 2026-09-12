import Testing
@testable import HausUI

@Suite struct AskOptionsTests {
    /// The Agent's order is the reader's order, and the recommendation is the
    /// first option it wrote.
    @Test func offersTheOptionsInTheOrderTheAgentWroteThem() {
        let options = AskOptions(["Yes, rename it", "Keep #product", "Not now"])

        #expect(options.isOffered)
        #expect(options.options == ["Yes, rename it", "Keep #product", "Not now"])
        #expect(options.isRecommendation(0))
        #expect(!options.isRecommendation(1))
        #expect(!options.isRecommendation(2))
    }

    /// An Ask with no options is an open question: the composer below is the
    /// whole answer, so the row offers nothing at all.
    @Test func offersNothingForAnOpenQuestion() {
        let options = AskOptions([])

        #expect(!options.isOffered)
        #expect(options.answer(at: 0) == nil)
    }

    /// Pressing an option and typing the same words are the same Message, so
    /// nothing decorates the text an option sends.
    @Test func sendsTheOptionTextVerbatim() {
        let options = AskOptions(["Keep #product, pin a note instead"])

        #expect(options.answer(at: 0) == "Keep #product, pin a note instead")
        #expect(options.answer(at: 1) == nil)
    }

    /// One press spends the whole row: the Ask leaves on its own refetch, and
    /// until it does a second press would only post a second answer.
    @Test func spendsTheRowWhileAnAnswerIsInFlightAndOnceItLands() {
        #expect(!AskAnswerPress.idle.isSpent)
        #expect(AskAnswerPress.sending.isSpent)
        #expect(AskAnswerPress.answered.isSpent)
    }
}
