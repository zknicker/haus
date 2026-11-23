@testable import HausUI
import Testing

struct ComposerPlaceTests {
    @Test func placeholderFollowsThePlace() {
        #expect(ComposerPlace.captain.placeholder == "Reply")
        #expect(ComposerPlace.task.placeholder == "Reply")
        #expect(ComposerPlace.project(name: "product").placeholder == "Message #product")
        #expect(ComposerPlace.person(name: "Zach").placeholder == "Message Zach")
    }

    @Test func sendCircleIsAccentOnlyWhenSendable() {
        #expect(ComposerCircleStyle.send(canSend: true).fill == .accent)
        #expect(ComposerCircleStyle.send(canSend: false).fill == .strongFill)
        #expect(ComposerCircleStyle.send(canSend: false).ink == .mutedInk)
        #expect(ComposerCircleStyle.plus(isEnabled: true).fill == .strongFill)
    }
}
