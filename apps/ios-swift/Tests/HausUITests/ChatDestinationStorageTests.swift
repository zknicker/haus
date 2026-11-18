import Testing
@testable import HausUI

@Suite struct ChatDestinationStorageTests {
    @Test func roundTripsBothDestinationKinds() {
        let ids: [ChatDestination.ID] = [.chat("cht_123"), .agentDM("agt_456")]
        for id in ids {
            #expect(ChatDestination.ID(storageValue: id.storageValue) == id)
        }
    }

    @Test func rejectsUnrecognizedStorageValues() {
        #expect(ChatDestination.ID(storageValue: "") == nil)
        #expect(ChatDestination.ID(storageValue: "cht_123") == nil)
        #expect(ChatDestination.ID(storageValue: "side:cht_123") == nil)
    }
}
