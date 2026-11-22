import HausModels
import Testing
@testable import HausUI

@MainActor
@Suite("Stop on the Captain, as the menus read it")
struct CaptainStopCopyTests {
    @Test("A pending stop and a settled one read differently, and neither acts")
    func phasesReadApart() {
        #expect(CaptainStopCopy.title(.available) == "Stop")
        #expect(CaptainStopCopy.title(.stopping) == "Stopping…")
        #expect(CaptainStopCopy.title(.stopped) == "Stopped")
        #expect(CaptainStopCopy.isActionable(.available))
        #expect(!CaptainStopCopy.isActionable(.stopping))
        #expect(!CaptainStopCopy.isActionable(.stopped))
    }

    @Test("The DM header's Stop is destructive only while it can act")
    func headerAction() {
        let offered = ChatHeaderMenuAction.captainStop(.available) {}
        #expect(offered.isEnabled)
        #expect(offered.isDestructive)
        #expect(offered.title == "Stop")

        let pending = ChatHeaderMenuAction.captainStop(.stopping) {}
        #expect(!pending.isEnabled)
        #expect(!pending.isDestructive)
        #expect(pending.title == "Stopping…")
    }

    @Test("The confirmation names the Captain")
    func confirmationCopy() {
        #expect(CaptainStopCopy.confirmationTitle(name: "Blippy") == "Stop Blippy?")
        #expect(CaptainStopCopy.confirmationMessage(name: "Blippy").hasPrefix("Blippy ends the turn"))
    }
}
