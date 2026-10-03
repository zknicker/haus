import Foundation
@testable import HausUI
import Testing

/// Which Chat rows state their inline-reply reference and which join the
/// identity block above, mirroring the App's `markRepeatedReplyReferences`.
struct TranscriptRowGroupingTests {
    @Test func firstReplyShowsItsReferenceAndOpensANewBlock() {
        let parent = message("m1", by: zach)
        let reply = message("m2", by: blippy, replyingTo: parent, at: 10)

        let grouping = TranscriptRowGrouping(reply, after: parent)

        #expect(grouping.showsReplyReference)
        #expect(!grouping.isContinuation)
    }

    @Test func sameAuthorFollowUpToTheSameParentHidesTheReference() {
        let parent = message("m1", by: zach)
        let first = message("m2", by: blippy, replyingTo: parent, at: 10)
        let second = message("m3", by: blippy, replyingTo: parent, at: 20)

        let grouping = TranscriptRowGrouping(second, after: first)

        #expect(!grouping.showsReplyReference)
        #expect(grouping.isContinuation)
    }

    @Test func aFollowUpToADifferentParentShowsItsReference() {
        let parent = message("m1", by: zach)
        let other = message("m0", by: zach)
        let first = message("m2", by: blippy, replyingTo: parent, at: 10)
        let second = message("m3", by: blippy, replyingTo: other, at: 20)

        let grouping = TranscriptRowGrouping(second, after: first)

        #expect(grouping.showsReplyReference)
        #expect(!grouping.isContinuation)
    }

    @Test func aDifferentAuthorReplyingToTheSameParentShowsItsReference() {
        let parent = message("m1", by: zach)
        let first = message("m2", by: blippy, replyingTo: parent, at: 10)
        let second = message("m3", by: tiny, replyingTo: parent, at: 20)

        let grouping = TranscriptRowGrouping(second, after: first)

        #expect(grouping.showsReplyReference)
        #expect(!grouping.isContinuation)
    }

    /// The App's rule holds across any gap; only the identity block restarts.
    @Test func aLateFollowUpStillHidesTheReferenceButRestatesIdentity() {
        let parent = message("m1", by: zach)
        let first = message("m2", by: blippy, replyingTo: parent, at: 10)
        let second = message("m3", by: blippy, replyingTo: parent, at: 10 + 6 * 60)

        let grouping = TranscriptRowGrouping(second, after: first)

        #expect(!grouping.showsReplyReference)
        #expect(!grouping.isContinuation)
    }

    @Test func aPlainMessageNeverJoinsAReplysBlock() {
        let parent = message("m1", by: zach)
        let reply = message("m2", by: blippy, replyingTo: parent, at: 10)
        let plain = message("m3", by: blippy, at: 20)

        #expect(!TranscriptRowGrouping(plain, after: reply).isContinuation)
    }

    @Test func plainMessagesFromOneAuthorStillGroup() {
        let first = message("m1", by: blippy)
        let second = message("m2", by: blippy, at: 30)

        let grouping = TranscriptRowGrouping(second, after: first)

        #expect(grouping.isContinuation)
        #expect(!grouping.showsReplyReference)
    }

    @Test func theFirstRowShowsItsReference() {
        let parent = message("m1", by: zach)
        let reply = message("m2", by: blippy, replyingTo: parent)

        let grouping = TranscriptRowGrouping(reply, after: nil)

        #expect(grouping.showsReplyReference)
        #expect(!grouping.isContinuation)
    }
}

private let start = Date(timeIntervalSince1970: 1_800_000_000)
private let zach = MessageAuthorPresentation(id: "user-zach", name: "Zach", avatarURL: nil)
private let blippy = MessageAuthorPresentation(id: "agent-blippy", name: "Blippy", avatarURL: nil)
private let tiny = MessageAuthorPresentation(id: "agent-tiny", name: "Tiny", avatarURL: nil)

private func message(
    _ id: String,
    by author: MessageAuthorPresentation,
    replyingTo parent: MessagePresentation? = nil,
    at offset: TimeInterval = 0
) -> MessagePresentation {
    MessagePresentation(
        id: id,
        author: author,
        content: "Message \(id)",
        createdAt: start.addingTimeInterval(offset),
        inlineReply: parent.map {
            MessageReplyReferencePresentation(
                id: $0.id,
                author: $0.author,
                content: $0.content,
                createdAt: $0.createdAt
            )
        }
    )
}
