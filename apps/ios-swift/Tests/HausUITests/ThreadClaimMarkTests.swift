import Foundation
import HausModels
@testable import HausUI
import Testing

/// A claim on a message inside a Thread: stated on that message under the
/// reader's Chat preference, and never a Thread of its own.
struct ThreadClaimMarkTests {
    @Test func hidesAThreadClaimUntilTheReaderAsksForIt() {
        let claim = ClaimPresentation(number: 12, origin: .claimed, status: .inProgress, assignee: nil)

        #expect(ThreadClaimMark.stated(claim, showClaimsInChat: false) == nil)
        #expect(ThreadClaimMark.stated(claim, showClaimsInChat: true) == claim)
    }

    @Test func keepsAThreadClaimAHumanMadeWhateverThePreferenceSays() {
        for origin in [ClaimOrigin.composed, .converted] {
            let claim = ClaimPresentation(number: 12, origin: origin, status: .todo, assignee: nil)

            #expect(ThreadClaimMark.stated(claim, showClaimsInChat: false) == claim)
        }
    }

    @Test func marksNothingOnAReplyWithoutAClaim() {
        #expect(ThreadClaimMark.stated(nil, showClaimsInChat: true) == nil)
        #expect(ThreadClaimMark.stated(nil, showClaimsInChat: false, isOpenedClaim: true) == nil)
    }

    /// Opened from the Tasks list, the claim is what the reader asked to see.
    @Test func showsTheClaimTheThreadWasOpenedForWhateverThePreferenceSays() {
        let claim = ClaimPresentation(number: 12, origin: .claimed, status: .inProgress, assignee: nil)

        #expect(ThreadClaimMark.stated(claim, showClaimsInChat: false, isOpenedClaim: true) == claim)
    }

    /// The anchor's own claim must not stand in for the reply's: the title stops
    /// naming it, and its card names itself instead.
    @Test func stopsTitlingTheThreadForTheAnchorsClaimWhenOpenedForAReplysClaim() {
        let author = MessageAuthorPresentation(id: "agent_1", name: "Piper", avatarURL: nil)
        let anchorClaim = ClaimPresentation(number: 3, origin: .composed, status: .done, assignee: nil)
        let anchor = MessagePresentation(
            id: "message_anchor", author: author, content: "Ship it",
            createdAt: Date(timeIntervalSince1970: 1_767_225_600), claim: anchorClaim
        )

        #expect(ThreadOpening.title(anchor: anchor) == "Claim #3")
        #expect(ThreadOpening.title(anchor: anchor, claimMessageID: "message_anchor") == "Claim #3")
        #expect(ThreadOpening.title(anchor: anchor, claimMessageID: "message_reply") == "Thread")
        #expect(ThreadOpening.opensForReplyClaim(anchor: anchor, claimMessageID: "message_reply"))
        #expect(!ThreadOpening.opensForReplyClaim(anchor: anchor, claimMessageID: nil))
    }

    /// The claim message sits in its work surface already; offering a Thread
    /// off it would nest a Thread inside itself.
    @Test func givesAThreadClaimNoThreadPreviewOfItsOwn() throws {
        let claim = try messageClaim(chatID: "chat_product", threadChatID: "cht_thr_message_anchor")

        #expect(ThreadPreviewProjection.claimThread(claim, messageChatID: "cht_thr_message_anchor") == nil)
    }

    @Test func offersATopLevelClaimTheThreadAnchoredOnIt() throws {
        let claim = try messageClaim(chatID: "chat_product", threadChatID: "cht_thr_message_1")

        let preview = ThreadPreviewProjection.claimThread(claim, messageChatID: "chat_product")

        #expect(preview?.threadChatID == "cht_thr_message_1")
        #expect(preview?.replyCount == 0)
    }

    /// The anchor carries the metadata card; a reply carries the mark.
    @Test func keepsAReplysClaimOnTheReplyInTheThreadTranscript() {
        let claim = ClaimPresentation(number: 12, origin: .claimed, status: .inProgress, assignee: nil)
        let author = MessageAuthorPresentation(id: "agent_1", name: "Piper", avatarURL: nil)
        let sentAt = Date(timeIntervalSince1970: 1_767_225_600)
        let anchor = MessagePresentation(id: "message_anchor", author: author, content: "Can you pull the numbers?", createdAt: sentAt)
        let reply = MessagePresentation(id: "message_reply", author: author, content: "On it", createdAt: sentAt, claim: claim)

        let items = ThreadTranscriptItem.items(anchor: anchor, replies: [reply])

        #expect(items.map(\.id) == ["thread-anchor-message_anchor", "message_reply"])
        #expect(items.last == .reply(reply))
    }

    private func messageClaim(chatID: String, threadChatID: String) throws -> MessageClaim {
        try HausJSON.decoder().decode(
            MessageClaim.self,
            from: Data(
                """
                {"assigneeAgentId":"agent_1","chatId":"\(chatID)","claimedAt":"2026-01-01T00:00:10Z","createdAt":"2026-01-01T00:00:10Z","createdByAgentId":"agent_1","createdByUserId":null,"labels":[],"live":true,"messageId":"message_reply","number":12,"origin":"claimed","priority":"none","status":"in_progress","threadChatId":"\(threadChatID)","tier":"tracked","updatedAt":"2026-01-01T00:00:10Z","version":1}
                """.utf8
            )
        )
    }
}
