import HausModels
@testable import HausUI
import Testing

struct MessageClaimMarkTests {
    @Test func hidesAnAgentClaimUntilTheReaderAsksForIt() {
        let claim = ClaimPresentation(number: 12, origin: .claimed, status: .inProgress, assignee: nil)

        #expect(MessageClaimMark.stated(claim, showClaimsInChat: false) == nil)
        #expect(MessageClaimMark.stated(claim, showClaimsInChat: true) == claim)
    }

    @Test func keepsAClaimAHumanMadeWhateverThePreferenceSays() {
        for origin in [ClaimOrigin.composed, .converted] {
            let claim = ClaimPresentation(number: 12, origin: origin, status: .todo, assignee: nil)

            #expect(MessageClaimMark.stated(claim, showClaimsInChat: false) == claim)
        }
    }

    @Test func marksNothingOnAMessageWithoutAClaim() {
        #expect(MessageClaimMark.stated(nil, showClaimsInChat: true) == nil)
    }
}
