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

    @Test func taskMessagesUseTheAssistantLayoutUnderTheStartedFromRow() {
        let origin = TaskStartedFromPresentation(placeLabel: "#security", excerpt: nil)
        let messages = [
            message("r1", at: day(0, hour: 10, minute: 0)),
            message("r2", at: day(1, hour: 8, minute: 0)),
            message("r3", at: day(1, hour: 8, minute: 1)),
        ]

        let items = TaskTranscriptItem.items(startedFrom: origin, messages: messages, hasOlder: false, calendar: utc)
        let entries = items.compactMap { item -> MessageTimelineEntry? in
            if case .message(let entry) = item { entry } else { nil }
        }

        #expect(items.map(\.id) == ["task-started-from", "r1", "r2", "r3"])
        #expect(entries.allSatisfy { $0.style == .assistant })
        #expect(entries.map(\.grouping.divider) == [.time, .time, nil])
    }

    @Test func aRunOfRepliesToOneParentStatesItsReferenceOnce() {
        let target = message("r1", at: day(0, hour: 9, minute: 1))
        let first = message("i1", at: day(0, hour: 9, minute: 2), replyingTo: target)
        let second = message("i2", at: day(0, hour: 9, minute: 3), replyingTo: target)

        let groupings = [
            TranscriptRowGrouping(first, after: target, calendar: utc),
            TranscriptRowGrouping(second, after: first, calendar: utc),
        ]

        #expect(groupings.map(\.showsReplyReference) == [true, false])
        #expect(groupings.map(\.isContinuation) == [false, true])
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

