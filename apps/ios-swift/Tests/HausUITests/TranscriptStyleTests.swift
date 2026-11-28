import Foundation
@testable import HausUI
import Testing

/// Which row shape each style gives a message, how rows group per style, and
/// what the assistant layout's turn times say.
struct TranscriptStyleTests {
    private typealias Fixture = TranscriptStyleFixture

    @Test func theRosterGivesEveryoneARosterRow() {
        let ask = Fixture.message("m1", by: Fixture.person, at: 0)
        let reply = Fixture.message("m2", by: Fixture.captain, at: 10)

        #expect(MessageRowLayout(style: .roster, message: ask) == .roster)
        #expect(MessageRowLayout(style: .roster, message: reply) == .roster)
    }

    @Test func theAssistantBubblesThePersonAndSetsTheCaptainAsProse() {
        let ask = Fixture.message("m1", by: Fixture.person, at: 0)
        let pending = Fixture.message("m2", by: Fixture.person, at: 5, isPending: true)
        let reply = Fixture.message("m3", by: Fixture.captain, at: 10)

        #expect(MessageRowLayout(style: .assistant, message: ask) == .bubble)
        #expect(MessageRowLayout(style: .assistant, message: pending) == .bubble)
        #expect(MessageRowLayout(style: .assistant, message: reply) == .prose)
    }

    @Test func theSpeakerComesFromTheAuthorKindNotPresence() {
        let deletedCaptain = MessageAuthorPresentation(id: "agent-gone", name: "Deleted Captain", avatarURL: nil, kind: .captain)
        let personWithPresence = MessageAuthorPresentation(id: "user-x", name: "X", avatarURL: nil, presence: .idle)

        #expect(MessageRowLayout(style: .assistant, message: Fixture.message("m1", by: deletedCaptain, at: 0)) == .prose)
        #expect(MessageRowLayout(style: .assistant, message: Fixture.message("m2", by: personWithPresence, at: 5)) == .bubble)
    }

    @Test func aCaptainChatIsTheAssistantLayoutAndEveryOtherPlaceKeepsRosterRows() {
        let captain = ChatKind.captainChat(ChatFixtures.cove)
        let person = ChatKind.humanDirectMessage(HumanPresentation(id: "u", name: "Mia", handle: nil, avatarURL: nil))

        #expect(captain.transcriptStyle == .assistant)
        #expect(ChatKind.channel.transcriptStyle == .roster)
        #expect(person.transcriptStyle == .roster)
        #expect(captain.composerPlace(title: "Cove").placeholder == "Reply")
        #expect(ChatKind.channel.composerPlace(title: "product").placeholder == "Message #product")
        #expect(person.composerPlace(title: "Mia").placeholder == "Message Mia")
    }

    @Test func theRosterKeepsDayDividersAndIdentityBlocks() {
        let messages = [
            Fixture.message("m1", by: Fixture.person, at: 0),
            Fixture.message("m2", by: Fixture.person, at: 60),
            Fixture.message("m3", by: Fixture.captain, at: 120),
            Fixture.message("m4", by: Fixture.captain, at: 26 * 3_600),
        ]

        let entries = MessageTimelineProjection.entries(for: messages, style: .roster, calendar: Fixture.utc)

        #expect(entries.map(\.grouping.divider) == [.day, nil, nil, .day])
        #expect(entries.map(\.grouping.isContinuation) == [false, true, false, false])
        #expect(entries.map(\.topSpacing) == [0, 4, 16, 0])
    }

    @Test func theAssistantTimesEachTurnAfterAPause() {
        let messages = [
            Fixture.message("m1", by: Fixture.person, at: 0),
            Fixture.message("m2", by: Fixture.captain, at: 30),
            Fixture.message("m3", by: Fixture.captain, at: 60),
            // A quick follow-up turn reads as the same exchange.
            Fixture.message("m4", by: Fixture.person, at: 120),
            Fixture.message("m5", by: Fixture.captain, at: 150),
            // A turn after a pause states its time.
            Fixture.message("m6", by: Fixture.person, at: 20 * 60),
            // A Captain speaking after a long quiet states it too.
            Fixture.message("m7", by: Fixture.captain, at: 3 * 3_600),
        ]

        let entries = MessageTimelineProjection.entries(for: messages, style: .assistant, calendar: Fixture.utc)

        #expect(entries.map(\.grouping.divider) == [.time, nil, nil, nil, nil, .time, .time])
        #expect(entries.map(\.grouping.isContinuation) == [false, false, true, false, false, false, false])
        #expect(entries.map(\.topSpacing) == [0, 18, 12, 18, 18, 0, 0])
        #expect(entries.allSatisfy { $0.style == .assistant })
    }

    @Test func theAssistantTimesANewDayEvenMidTurn() {
        let late = Fixture.message("m1", by: Fixture.captain, at: 0)
        let next = Fixture.message("m2", by: Fixture.captain, at: 17 * 3_600)

        let grouping = TranscriptRowGrouping(next, after: late, style: .assistant, calendar: Fixture.utc)

        #expect(grouping.startsDay)
        #expect(grouping.divider == .time)
    }

    @Test func aShownReplyReferenceOpensItsOwnAssistantRow() {
        let parent = Fixture.message("m1", by: Fixture.captain, at: 0)
        let first = Fixture.message("m2", by: Fixture.person, at: 10, replyingTo: parent)
        let again = Fixture.message("m3", by: Fixture.person, at: 20, replyingTo: parent)

        let opening = TranscriptRowGrouping(first, after: parent, style: .assistant)
        let following = TranscriptRowGrouping(again, after: first, style: .assistant)

        #expect(opening.showsReplyReference)
        #expect(!opening.isContinuation)
        #expect(!following.showsReplyReference)
        #expect(following.isContinuation)
    }

    @Test func aStyleChangeChangesEveryEntry() {
        let messages = Fixture.history(turns: 4)

        let roster = MessageTimelineProjection.entries(for: messages, style: .roster, calendar: Fixture.utc)
        let assistant = MessageTimelineProjection.entries(for: messages, style: .assistant, calendar: Fixture.utc)

        #expect(Fixture.changedIDs(from: roster, to: assistant) == messages.map(\.id))
    }

    @Test func turnTimesReadTheTimeTodayAndTheDayBeforeIt() {
        let now = Fixture.start.addingTimeInterval(3 * 86_400)
        let title = { (offset: TimeInterval) in
            TranscriptTimeLabel.title(
                for: now.addingTimeInterval(offset),
                now: now,
                calendar: Fixture.utc,
                locale: Locale(identifier: "en_US")
            )
        }
        let today = title(-3_600)
        let yesterday = title(-86_400)

        #expect(!today.contains("Today"))
        #expect(today.contains(":"))
        #expect(yesterday.hasPrefix("Yesterday "))
    }

    @Test func aBubbleHugsShortWordsAndWrapsAtItsShareOfTheRow() {
        #expect(TranscriptTrailingColumn.width(ideal: 120, available: 400) == 120)
        #expect(TranscriptTrailingColumn.width(ideal: 900, available: 400) == 304)
    }

    @Test func theReadersOwnSendLandsAtTheTopWhenTheSettingIsOn() {
        let behavior = { (decision: MessageTimelineTailScroll, pending: Bool, toTop: Bool) in
            MessageTimelineTailScroll.behavior(
                decision: decision,
                isLatestPending: pending,
                scrollsNewMessagesToTop: toTop
            )
        }

        #expect(behavior(.animate, true, true) == .landAtTop)
        #expect(behavior(.animate, true, false) == .animateToNewest)
        #expect(behavior(.animate, false, true) == .followNewest)
        #expect(behavior(.ignore, false, true) == .stay)
        #expect(behavior(.snap, false, true) == .snapToNewest)
        #expect(!ScrollNewMessagesToTop.defaultValue)
    }
}
