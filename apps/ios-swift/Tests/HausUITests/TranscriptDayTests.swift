import Foundation
@testable import HausUI
import Testing

/// Day boundaries in a transcript: where a divider opens a day, that no
/// identity block runs across one, and what each divider says.
struct TranscriptDayTests {
    @Test func aContinuationBreaksAtMidnight() {
        let late = message("m1", at: day(0, hour: 23, minute: 58))
        let early = message("m2", at: day(1, hour: 0, minute: 1))

        let grouping = TranscriptRowGrouping(early, after: late, calendar: utc)

        #expect(grouping.startsDay)
        #expect(!grouping.isContinuation)
    }

    @Test func theSameDayKeepsGrouping() {
        let first = message("m1", at: day(0, hour: 9, minute: 0))
        let second = message("m2", at: day(0, hour: 9, minute: 2))

        let grouping = TranscriptRowGrouping(second, after: first, calendar: utc)

        #expect(!grouping.startsDay)
        #expect(grouping.isContinuation)
    }

    @Test func theFirstLoadedRowOpensItsDay() {
        let first = message("m1", at: day(0, hour: 9, minute: 0))
        #expect(TranscriptRowGrouping(first, after: nil, calendar: utc).startsDay)
    }

    @Test func timelineEntriesCarryEachRowsDayAndPosition() {
        let messages = [
            message("m1", at: day(0, hour: 9, minute: 0)),
            message("m2", at: day(0, hour: 9, minute: 1)),
            message("m3", at: day(2, hour: 8, minute: 0)),
        ]

        let entries = MessageTimelineProjection.entries(for: messages, calendar: utc)

        #expect(entries.map(\.grouping.startsDay) == [true, false, true])
        #expect(entries.map(\.isFirst) == [true, false, false])
        #expect(entries.map(\.grouping.isContinuation) == [false, true, false])
    }

    @Test func dayLabelsReadRelativeThenAbsolute() {
        let now = day(10, hour: 15, minute: 0)
        let title = { (date: Date) in
            TranscriptDayLabel.title(for: date, now: now, calendar: utc, locale: Locale(identifier: "en_US"))
        }

        #expect(title(day(10, hour: 1, minute: 0)) == "Today")
        #expect(title(day(9, hour: 23, minute: 0)) == "Yesterday")
        // 2027-01-15 is a Friday; four days earlier is a Monday.
        #expect(title(day(6, hour: 12, minute: 0)) == "Monday")
        #expect(title(day(0, hour: 12, minute: 0)) == "Tue, Jan 5")
        #expect(title(day(-30, hour: 12, minute: 0)) == "Sun, Dec 6, 2026")
    }

    @Test func threadRepliesOpenEachNewDay() {
        let anchor = message("root", at: day(0, hour: 9, minute: 0))
        let replies = [
            message("r1", at: day(0, hour: 10, minute: 0)),
            message("r2", at: day(1, hour: 8, minute: 0)),
            message("r3", at: day(1, hour: 9, minute: 0)),
        ]

        let items = ThreadTranscriptItem.items(anchor: anchor, replies: replies, calendar: utc)

        #expect(items.map(\.id) == [
            "thread-anchor-root",
            "r1",
            "thread-day-\(Int(day(1, hour: 0, minute: 0).timeIntervalSinceReferenceDate))",
            "r2",
            "r3",
        ])
        #expect(items.compactMap(\.replyID) == ["r1", "r2", "r3"])
    }

    @Test func aDayDividerFollowsTheMergedConversation() {
        let anchor = message("root", at: day(0, hour: 9, minute: 0))
        let items = ThreadTranscriptItem.items(
            anchor: anchor,
            replies: [message("r1", at: day(1, hour: 9, minute: 0))],
            includesInlineReplies: true,
            inlineReplies: [message("i1", at: day(1, hour: 8, minute: 0))],
            calendar: utc
        )
        #expect(items.map(\.id) == [
            "thread-anchor-root",
            "thread-inline-replies",
            "thread-day-\(Int(day(1, hour: 0, minute: 0).timeIntervalSinceReferenceDate))",
            "thread-inline-reply-i1",
            "r1",
        ])
    }

    /// A Thread groups like the Chat timeline: the anchor opens the first
    /// block, a quick follow-up by the same author continues it, and another
    /// author or a new day opens a block of its own.
    @Test func threadRowsGroupLikeChatRows() {
        let anchor = message("root", at: day(0, hour: 9, minute: 0))
        let followUp = message("r1", at: day(0, hour: 9, minute: 1))
        let other = MessagePresentation(
            id: "r2",
            author: MessageAuthorPresentation(id: "user-zach", name: "Zach", avatarURL: nil),
            content: "Message r2",
            createdAt: day(0, hour: 9, minute: 2)
        )
        let nextDay = message("r3", at: day(1, hour: 9, minute: 0))

        let items = ThreadTranscriptItem.items(
            anchor: anchor,
            replies: [followUp, other, nextDay],
            calendar: utc
        )
        let groupings = items.compactMap { item -> TranscriptRowGrouping? in
            switch item {
            case .anchor(_, let grouping), .reply(_, let grouping), .inlineReply(_, let grouping): grouping
            case .claimMetadata, .inlineReplies, .dayDivider: nil
            }
        }

        #expect(groupings.map(\.isContinuation) == [false, true, false, false])
        #expect(groupings.map(\.startsDay) == [true, false, false, true])
        #expect(groupings == [
            TranscriptRowGrouping(anchor, after: nil, calendar: utc),
            TranscriptRowGrouping(followUp, after: anchor, calendar: utc),
            TranscriptRowGrouping(other, after: followUp, calendar: utc),
            TranscriptRowGrouping(nextDay, after: other, calendar: utc),
        ])
    }

    /// The anchor heads the Thread, so an inline reply to it states no
    /// reference and groups as a plain message.
    @Test func aReplyToTheAnchorStatesNoReference() {
        let anchor = message("root", at: day(0, hour: 9, minute: 0))
        let first = message("i1", at: day(0, hour: 9, minute: 1), replyingTo: anchor)
        let second = message("i2", at: day(0, hour: 9, minute: 2), replyingTo: anchor)

        let groupings = threadGroupings(anchor: anchor, inlineReplies: [first, second])

        #expect(groupings.map(\.showsReplyReference) == [false, false])
        #expect(groupings.map(\.isContinuation) == [true, true])
    }

    /// A reference to anything but the anchor still shows, once per run.
    @Test func aReplyToAnotherMessageKeepsItsReference() {
        let anchor = message("root", at: day(0, hour: 9, minute: 0))
        let target = message("r1", at: day(0, hour: 9, minute: 1))
        let first = message("i1", at: day(0, hour: 9, minute: 2), replyingTo: target)
        let second = message("i2", at: day(0, hour: 9, minute: 3), replyingTo: target)

        let groupings = threadGroupings(anchor: anchor, replies: [target], inlineReplies: [first, second])

        #expect(groupings.map(\.showsReplyReference) == [false, true, false])
        #expect(groupings.map(\.isContinuation) == [true, false, true])
    }

    @Test func anEmptyParentChainAddsNoRows() {
        let anchor = message("root", at: day(0, hour: 9, minute: 0))
        let items = ThreadTranscriptItem.items(
            anchor: anchor,
            replies: [],
            includesInlineReplies: true,
            inlineReplies: [],
            calendar: utc
        )
        #expect(items.map(\.id) == ["thread-anchor-root", "thread-inline-replies"])
    }
}

private let utc: Calendar = {
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = TimeZone(identifier: "UTC")!
    return calendar
}()

/// Day `offset` from Tuesday 2027-01-05 (UTC).
private func day(_ offset: Int, hour: Int, minute: Int) -> Date {
    let base = utc.date(from: DateComponents(year: 2027, month: 1, day: 5))!
    let start = utc.date(byAdding: .day, value: offset, to: base)!
    return utc.date(byAdding: DateComponents(hour: hour, minute: minute), to: start)!
}

private func message(
    _ id: String,
    at date: Date,
    replyingTo parent: MessagePresentation? = nil
) -> MessagePresentation {
    MessagePresentation(
        id: id,
        author: MessageAuthorPresentation(id: "agent-blippy", name: "Blippy", avatarURL: nil),
        content: "Message \(id)",
        createdAt: date,
        inlineReply: parent.map {
            MessageReplyReferencePresentation(id: $0.id, author: $0.author, content: $0.content, createdAt: $0.createdAt)
        }
    )
}

/// The groupings of a Thread's conversation rows, after the anchor.
private func threadGroupings(
    anchor: MessagePresentation,
    replies: [MessagePresentation] = [],
    inlineReplies: [MessagePresentation]
) -> [TranscriptRowGrouping] {
    ThreadTranscriptItem.items(
        anchor: anchor,
        replies: replies,
        includesInlineReplies: true,
        inlineReplies: inlineReplies,
        calendar: utc
    ).compactMap { item in
        switch item {
        case .reply(_, let grouping), .inlineReply(_, let grouping): grouping
        case .anchor, .claimMetadata, .inlineReplies, .dayDivider: nil
        }
    }
}
