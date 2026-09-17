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

struct MessageTimelineScrollTargetTests {
    @Test func revealsAMessageOnTheLoadedPage() {
        #expect(
            MessageTimelineScrollTarget.resolve(
                target: "m2",
                messageIDs: ["m1", "m2", "m3"]
            ) == .reveal("m2")
        )
    }

    @Test func dropsARequestTheLoadedPageCannotSatisfy() {
        #expect(
            MessageTimelineScrollTarget.resolve(
                target: "older",
                messageIDs: ["m1", "m2"]
            ) == .unavailable
        )
    }

    @Test func waitsWhileTheChatPageIsStillLoading() {
        #expect(
            MessageTimelineScrollTarget.resolve(target: "m1", messageIDs: []) == .waiting
        )
    }

    @Test func pagesWhenAReplyParentSequencePrecedesLoadedHistory() {
        #expect(
            MessageTimelineScrollTarget.shouldLoadOlder(
                targetSequence: 4,
                loadedMessageSequences: [8, 9],
                hasOlderMessages: true
            )
        )
    }

    @Test func stopsPagingWhenTheParentSequenceIsInLoadedHistoryRange() {
        #expect(
            !MessageTimelineScrollTarget.shouldLoadOlder(
                targetSequence: 8,
                loadedMessageSequences: [8, 9],
                hasOlderMessages: true
            )
        )
    }

    @Test func pagesWithoutASequenceUntilHistoryEnds() {
        #expect(
            MessageTimelineScrollTarget.shouldLoadOlder(
                targetSequence: nil,
                loadedMessageSequences: [8, 9],
                hasOlderMessages: true
            )
        )
    }
}
