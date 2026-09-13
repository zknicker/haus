import Foundation
@testable import HausUI
import Testing

/// Which Ask in a Thread the next reply answers.
struct ThreadAskAnswerabilityTests {
    /// An Agent can ask inside a Thread as easily as it can start one, so the
    /// open decision is not always the anchor's.
    @Test func answersAnAskPostedAsAReply() {
        let rows = [
            message("message_anchor", ask: nil),
            message("message_reply", ask: AskPresentation(status: .open, options: ["Ship it"])),
        ]

        #expect(ThreadAskAnswerability.answerableMessageID(rows: rows) == "message_reply")
    }

    /// An Agent that asked twice is waiting on the second question, which is
    /// also the Ask Server settles the reply against.
    @Test func answersTheNewestOpenAskInTheThread() {
        let rows = [
            message("message_anchor", ask: AskPresentation(status: .open, options: ["First"])),
            message("message_first", ask: AskPresentation(status: .open, options: ["Second"])),
            message("message_second", ask: AskPresentation(status: .open, options: ["Third"])),
        ]

        #expect(ThreadAskAnswerability.answerableMessageID(rows: rows) == "message_second")
    }

    /// A top-level Ask anchors its own Thread, so before any reply the anchor
    /// is the answerable Ask.
    @Test func answersATopLevelAskFromItsOwnThread() {
        let rows = [
            message("message_anchor", ask: AskPresentation(status: .open, options: ["Friday"])),
            message("message_reply", ask: nil),
        ]

        #expect(ThreadAskAnswerability.answerableMessageID(rows: rows) == "message_anchor")
    }

    /// A settled Ask keeps nothing: the first answer won permanently, so once
    /// every Ask here is settled the Thread answers none of them.
    @Test func answersNothingOnceEveryAskInTheThreadIsSettled() {
        let rows = [
            message("message_anchor", ask: AskPresentation(status: .answered)),
            message("message_reply", ask: AskPresentation(status: .answered)),
        ]

        #expect(ThreadAskAnswerability.answerableMessageID(rows: rows) == nil)
    }

    @Test func answersNothingInAThreadWithNoAsks() {
        let rows = [message("message_anchor", ask: nil), message("message_reply", ask: nil)]

        #expect(ThreadAskAnswerability.answerableMessageID(rows: rows) == nil)
    }

    private func message(_ id: String, ask: AskPresentation?) -> MessagePresentation {
        MessagePresentation(
            id: id,
            author: MessageAuthorPresentation(id: "agent_blippy", name: "Blippy", avatarURL: nil),
            content: "Ship the iPhone build",
            createdAt: Date(timeIntervalSince1970: 1_800_000_000),
            attachments: [],
            ask: ask
        )
    }
}
