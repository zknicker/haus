import Foundation
import HausModels
@testable import HausUI
import Testing

/// What the Conversations section lists, and what its quoted line says.
struct InboxConversationRowsTests {
    @Test func listsOnlyUnreadChatsNewestFirst() {
        let rows = InboxConversationRows.rows(
            [
                InboxFixtures.chat(
                    id: "older",
                    name: "product",
                    lastActivityAt: Date(timeIntervalSince1970: 1_799_000_000)
                ),
                InboxFixtures.chat(id: "read", name: "design", unreadCount: 0),
                InboxFixtures.chat(
                    id: "newer",
                    name: "all",
                    lastActivityAt: Date(timeIntervalSince1970: 1_800_000_000)
                ),
            ],
            viewerDisplayName: "Marlow"
        )

        #expect(rows.map(\.id) == ["newer", "older"])
        #expect(rows.map(\.title) == ["#all", "#product"])
    }

    @Test func keepsEveryAuthorNameInAChannel() {
        let preview = InboxConversationRows.previewLine(
            InboxFixtures.lastMessage(author: "Blippy", content: "Finished the audit"),
            peerDisplayName: nil,
            viewerDisplayName: "Marlow"
        )

        #expect(preview == "Blippy: Finished the audit")
    }

    @Test func dropsThePeersNameInsideTheirOwnDM() {
        let preview = InboxConversationRows.previewLine(
            InboxFixtures.lastMessage(author: "Tiny", content: "Finished the audit"),
            peerDisplayName: "Tiny",
            viewerDisplayName: "Marlow"
        )

        #expect(preview == "Finished the audit")
    }

    @Test func marksTheViewersOwnLine() {
        let preview = InboxConversationRows.previewLine(
            InboxFixtures.lastMessage(author: "Marlow", content: "On it"),
            peerDisplayName: "Tiny",
            viewerDisplayName: "Marlow"
        )

        #expect(preview == "You: On it")
    }

    /// The quote goes through the same flattener every other quoting surface
    /// on the phone uses, so a reference reads as the words on its chip.
    @Test func flattensTheQuotedLineToOneLine() {
        let preview = InboxConversationRows.previewLine(
            InboxFixtures.lastMessage(
                author: "Blippy",
                content: "Shipped\n\nthe [#product](chat://chat_1) build"
            ),
            peerDisplayName: "Blippy",
            viewerDisplayName: nil
        )

        #expect(preview == "Shipped the Product build")
    }

    @Test func aMessageThatFlattensToNothingStillNamesItsAuthor() {
        let preview = InboxConversationRows.previewLine(
            InboxFixtures.lastMessage(author: "Blippy", content: "   "),
            peerDisplayName: "Blippy",
            viewerDisplayName: nil
        )

        #expect(preview == "Blippy")
    }

    @Test func aChatHoldingNoMessageSaysSoRatherThanQuotingAnEmptyLine() {
        #expect(
            InboxConversationRows.previewLine(nil, peerDisplayName: nil, viewerDisplayName: nil)
                == nil
        )

        let rows = InboxConversationRows.rows(
            [InboxFixtures.chat(id: "chat_1", name: "product")],
            viewerDisplayName: nil
        )

        #expect(rows[0].preview == InboxConversationRows.noActivityPreview)
    }
}

/// The page's opening line.
struct InboxTodayTests {
    @Test func greetsByTheReadersOwnClock() {
        #expect(InboxToday.dayPart(hour: 0) == "Good morning")
        #expect(InboxToday.dayPart(hour: 11) == "Good morning")
        #expect(InboxToday.dayPart(hour: 12) == "Good afternoon")
        #expect(InboxToday.dayPart(hour: 17) == "Good afternoon")
        #expect(InboxToday.dayPart(hour: 18) == "Good evening")
    }

    @Test func usesTheNameAPersonIsCalledNotTheirFilingName() {
        #expect(InboxToday.firstName("  Marlow  Quill ") == "Marlow")
        #expect(InboxToday.firstName("Marlow") == "Marlow")
    }

    @Test func greetsWithBothHalves() {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: 0) ?? .gmt
        let morning = Date(timeIntervalSince1970: TimeInterval(1_800_000_000 - 1_800_000_000 % 86_400 + 32_400))

        #expect(
            InboxToday.greeting(name: "Marlow Quill", now: morning, calendar: calendar)
                == "Good morning, Marlow"
        )
    }
}
