import HausModels
import Testing
@testable import HausUI

@Suite("New Captain handle")
struct NewCaptainHandleTests {
    @Test("A name suggests a lowercase, dash-joined handle the Server accepts")
    func suggestsValidHandle() {
        let handle = NewCaptainFormView.handle(from: "Blippy the  Builder!")
        #expect(handle == "blippy-the-builder")
        #expect(ParticipantHandle.isValid(handle))
    }

    @Test("A long name's handle stops at the Server's limit")
    func capsLength() {
        let handle = NewCaptainFormView.handle(from: String(repeating: "a", count: 50))
        #expect(handle.count == 31)
        #expect(ParticipantHandle.isValid(handle))
    }
}
