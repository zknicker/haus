import Testing
@testable import HausUI

@Suite("Avatar generation concept")
struct AvatarGenerationConceptTests {
    @Test("trims the concept sent to the Server")
    func normalizesConcept() {
        #expect(
            AvatarGenerationConcept.normalized("  a moonlit fox cartographer \n")
                == "a moonlit fox cartographer"
        )
    }

    @Test("a blank concept cannot generate")
    @MainActor
    func blankConceptCannotGenerate() {
        let session = AvatarGenerationSession()
        session.concept = " \n "
        #expect(!session.canGenerate)
        session.concept = "a fox"
        #expect(session.canGenerate)
    }

    @Test("the field clamps to the Server's 280-character limit")
    @MainActor
    func clampsToMaximumLength() {
        let session = AvatarGenerationSession()
        session.concept = String(repeating: "a", count: 281)
        #expect(session.concept.count == 280)
    }
}
