@testable import HausUI
import Testing

struct MessageTimelineTailScrollTests {
    @Test func firstPageOfAChatArrivesAlreadySettled() {
        #expect(
            MessageTimelineTailScroll.decide(
                hadMessages: false,
                isNearBottom: true,
                isLatestPending: false
            ) == .snap
        )
    }

    @Test func firstPageSnapsEvenWhenTheReaderIsNotAtTheBottom() {
        // A freshly shown Chat has no reading position to respect yet, so the
        // page must not sweep into place.
        #expect(
            MessageTimelineTailScroll.decide(
                hadMessages: false,
                isNearBottom: false,
                isLatestPending: false
            ) == .snap
        )
    }

    @Test func appendAtTheBottomAnimates() {
        #expect(
            MessageTimelineTailScroll.decide(
                hadMessages: true,
                isNearBottom: true,
                isLatestPending: false
            ) == .animate
        )
    }

    @Test func ownSendRevealsItselfFromAboveTheTail() {
        #expect(
            MessageTimelineTailScroll.decide(
                hadMessages: true,
                isNearBottom: false,
                isLatestPending: true
            ) == .animate
        )
    }

    @Test func incomingMessageLeavesAScrolledBackReaderAlone() {
        #expect(
            MessageTimelineTailScroll.decide(
                hadMessages: true,
                isNearBottom: false,
                isLatestPending: false
            ) == .ignore
        )
    }
}

struct ChatCanvasOpenTests {
    @Test func opensTheSelectedChatWhileTheCanvasIsVisible() {
        #expect(
            ChatCanvasOpen.chatID(selectedID: .chat("c1"), isCovered: false) == "c1"
        )
    }

    @Test func standsDownWhileAPushedRouteCoversTheCanvas() {
        #expect(
            ChatCanvasOpen.chatID(selectedID: .chat("c1"), isCovered: true) == nil
        )
    }

    @Test func reopensTheSameChatOnceTheStackEmpties() {
        // Popping back from the Tasks list lands on the Chat the user left,
        // which the canvas then owns again.
        let covered = ChatCanvasOpen.chatID(selectedID: .chat("left"), isCovered: true)
        let uncovered = ChatCanvasOpen.chatID(selectedID: .chat("left"), isCovered: false)
        #expect(covered == nil)
        #expect(uncovered == "left")
    }

    @Test func anImplicitAgentDMHasNoServerChatToOpen() {
        #expect(ChatCanvasOpen.chatID(selectedID: .agentDM("a1"), isCovered: false) == nil)
        #expect(ChatCanvasOpen.chatID(selectedID: nil, isCovered: false) == nil)
    }

    @Test func namesTheCanvasChatEvenWhileAPushedRouteCoversIt() {
        // The canvas stands down from opening a covered Chat, but the Chat it
        // is showing still has to be nameable: it is what a pop lands on.
        #expect(ChatCanvasOpen.canvasChatID(selectedID: .chat("c1")) == "c1")
    }

    @Test func namesNoCanvasChatWithoutADurableChatSelection() {
        #expect(ChatCanvasOpen.canvasChatID(selectedID: .agentDM("a1")) == nil)
        #expect(ChatCanvasOpen.canvasChatID(selectedID: nil) == nil)
    }
}

struct OpenChatPagesTests {
    @Test func refreshesTheCanvasOnceWhenItIsTheSurfaceOnScreen() {
        #expect(
            OpenChatPages.toRefresh(focusedChatID: "c1", canvasChatID: "c1") == ["c1"]
        )
    }

    @Test func refreshesTheCoveredCanvasBehindAnOpenTask() {
        // The Task is on screen, so it refreshes first; the canvas Chat is
        // covered but is what the pop reveals, so it refreshes too.
        #expect(
            OpenChatPages.toRefresh(focusedChatID: "task-c1", canvasChatID: "c1")
                == ["task-c1", "c1"]
        )
    }

    @Test func refreshesTheCanvasWhileANonChatRouteCoversIt() {
        #expect(OpenChatPages.toRefresh(focusedChatID: nil, canvasChatID: "c1") == ["c1"])
    }

    @Test func refreshesNothingWithoutAnOpenSurface() {
        #expect(OpenChatPages.toRefresh(focusedChatID: nil, canvasChatID: nil).isEmpty)
    }
}
