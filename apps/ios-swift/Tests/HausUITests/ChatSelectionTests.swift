@testable import HausUI
import Testing

struct ChatSelectionTests {
    @Test func keepsASelectionThatStillExists() {
        #expect(
            ChatSelection.resolve(selectedID: "b", chatIDs: ["a", "b", "c"]) == "b"
        )
    }

    @Test func fallsForwardWhenTheSelectedChatIsGone() {
        #expect(
            ChatSelection.resolve(selectedID: "gone", chatIDs: ["a", "b"]) == "a"
        )
    }

    @Test func seedsTheFirstChatWhenNothingIsSelected() {
        #expect(ChatSelection.resolve(selectedID: nil, chatIDs: ["a", "b"]) == "a")
    }

    @Test func resolvesToNothingWithoutChats() {
        #expect(ChatSelection.resolve(selectedID: "a", chatIDs: []) == nil)
        #expect(ChatSelection.resolve(selectedID: nil, chatIDs: []) == nil)
    }
}

struct PendingChatSelectionTests {
    @Test func adoptsARestoredChannelOnceTheServerListCarriesIt() {
        #expect(
            ChatSelection.resolvePending(
                pendingID: "restored",
                chatIDs: ["a", "restored"]
            ) == "restored"
        )
    }

    @Test func keepsWaitingWhileTheChannelHasNotArrived() {
        #expect(
            ChatSelection.resolvePending(pendingID: "restored", chatIDs: ["a"]) == nil
        )
    }

    @Test func staysIdleWithoutAPendingRequest() {
        #expect(ChatSelection.resolvePending(pendingID: nil, chatIDs: ["a"]) == nil)
    }
}
