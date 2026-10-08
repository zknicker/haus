import Foundation
@testable import HausUI
import Testing

/// Which rows an update re-hosts, what VoiceOver reads and offers for a
/// message, and what a Thread screen calls itself.
struct TranscriptRowPolicyTests {
    @Test func anInsetOnlyUpdateReHostsNothing() {
        let rows = TranscriptRowReconfiguration.rows(
            visible: Array(0..<12),
            itemCount: 30,
            revisionChanged: false,
            changedItem: { _ in false }
        )
        #expect(rows.isEmpty)
    }

    @Test func onlyChangedItemsReHost() {
        let rows = TranscriptRowReconfiguration.rows(
            visible: Array(0..<12),
            itemCount: 30,
            revisionChanged: false,
            changedItem: { $0 == 0 || $0 == 4 }
        )
        #expect(rows == [0, 4])
    }

    @Test func screenStateReHostsEveryVisibleRowAndTheAccessory() {
        let rows = TranscriptRowReconfiguration.rows(
            visible: [27, 28, 29, 30],
            itemCount: 30,
            revisionChanged: true,
            changedItem: { _ in false }
        )
        #expect(rows == [27, 28, 29, 30])
    }

    @Test func voiceOverReadsAuthorTimeAndBodyAsOneLine() {
        let now = Date(timeIntervalSince1970: 1_800_000_000)
        let message = MessagePresentation(
            id: "m1",
            author: MessageAuthorPresentation(id: "a", name: "Blippy", avatarURL: nil),
            content: "Shipped it.\n\n```\nlet x = 1\n```",
            createdAt: now.addingTimeInterval(-60)
        )
        let label = MessageRowAccessibilityLabel.label(for: message, now: now)
        #expect(label.hasPrefix("Blippy, "))
        #expect(label.contains("Shipped it."))
        #expect(label.contains("let x = 1"))
        #expect(!label.contains("Today"))
    }

    @Test func voiceOverOffersTheDrawersActions() {
        let message = MessagePresentation(
            id: "m1",
            author: MessageAuthorPresentation(id: "a", name: "Blippy", avatarURL: nil),
            content: "Hello",
            createdAt: .now
        )
        let actions = MessageRowAccessibilityActions.forMessage(
            message,
            canReplyInline: true,
            canOpenThread: true,
            onReact: {},
            onReply: {},
            onOpenThread: {}
        )
        #expect(actions.onReact != nil)
        #expect(actions.actions == [.reply, .replyInThread, .copyText])
    }

    @Test func aPendingMessageOffersNoActions() {
        let message = MessagePresentation(
            id: "m1",
            author: MessageAuthorPresentation(id: "a", name: "Blippy", avatarURL: nil),
            content: "Hello",
            createdAt: .now,
            isPending: true
        )
        let actions = MessageRowAccessibilityActions.forMessage(
            message,
            canReplyInline: true,
            canOpenThread: true,
            onReact: {},
            onReply: {},
            onOpenThread: {}
        )
        #expect(actions.onReact == nil)
        #expect(actions.actions.isEmpty)
    }

    @Test func aNumberedListReservesItsWidestMarkerPerDepth() {
        let items = (1...10).map {
            RichMessageListItem(depth: 0, marker: .ordered($0), segments: [.text("item")])
        } + [RichMessageListItem(depth: 1, marker: .bullet, segments: [.text("nested")])]

        let widest = RichMessageListView.widestMarkers(items)

        #expect(widest == [0: "10.", 1: "\u{2022}"])
    }

    @Test func aTaskThreadIsNamedForItsTask() {
        #expect(ThreadOpening.title(anchor: ChatFixtures.messages[1]) == "Thread")
        if let task = ChatFixtures.messages[2].task {
            #expect(ThreadOpening.title(anchor: ChatFixtures.messages[2]) == "Task #\(task.number)")
        }
    }
}
