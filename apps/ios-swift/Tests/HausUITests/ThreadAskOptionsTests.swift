import Foundation
import HausModels
@testable import HausUI
import Testing

/// Which Ask a Thread screen offers options for.
struct ThreadAskOptionsTests {
    /// An Agent can ask inside a Thread as easily as it can start one, so the
    /// open decision is not always the anchor's.
    @Test func offersAnAskPostedAsAReply() throws {
        let offer = try #require(
            ThreadAskOptions.offered(
                openAsks: [
                    InboxFixtures.openAsk(
                        id: "ask_reply",
                        messageID: "message_reply",
                        options: ["Ship it", "Hold"],
                        threadAnchorMessageID: "message_anchor"
                    ),
                ],
                anchor: anchor(ask: nil)
            )
        )

        #expect(offer.id == "message_reply")
        #expect(offer.options.options == ["Ship it", "Hold"])
    }

    /// An Agent that asked twice is waiting on the second question.
    @Test func offersTheNewestOpenAskInTheThread() throws {
        let offer = try #require(
            ThreadAskOptions.offered(
                openAsks: [
                    InboxFixtures.openAsk(
                        id: "ask_first",
                        messageID: "message_first",
                        createdAt: "2026-09-11T09:00:00.000Z",
                        options: ["First"],
                        threadAnchorMessageID: "message_anchor"
                    ),
                    InboxFixtures.openAsk(
                        id: "ask_second",
                        messageID: "message_second",
                        createdAt: "2026-09-11T11:00:00.000Z",
                        options: ["Second"],
                        threadAnchorMessageID: "message_anchor"
                    ),
                ],
                anchor: anchor(ask: nil)
            )
        )

        #expect(offer.id == "message_second")
        #expect(offer.options.options == ["Second"])
    }

    /// A top-level Ask anchors its own Thread, so the anchor Message is the
    /// answer anchor and the snapshot still names it.
    @Test func offersATopLevelAskFromItsOwnThread() throws {
        let offer = try #require(
            ThreadAskOptions.offered(
                openAsks: [
                    InboxFixtures.openAsk(
                        id: "ask_anchor",
                        messageID: "message_anchor",
                        options: ["Friday", "Monday"]
                    ),
                ],
                anchor: anchor(ask: AskPresentation(status: .open, options: ["Friday", "Monday"]))
            )
        )

        #expect(offer.id == "message_anchor")
        #expect(offer.options.options == ["Friday", "Monday"])
    }

    /// Another Thread's Ask is another Thread's decision. A reply here would
    /// not answer it, so this screen offers nothing for it.
    @Test func ignoresAnAskFromAnotherThread() {
        let offer = ThreadAskOptions.offered(
            openAsks: [
                InboxFixtures.openAsk(
                    id: "ask_elsewhere",
                    messageID: "message_elsewhere",
                    threadAnchorMessageID: "message_other_anchor"
                ),
            ],
            anchor: anchor(ask: nil)
        )

        #expect(offer == nil)
    }

    /// A settled Ask keeps only its marker: the first answer won permanently.
    @Test func offersNothingOnceEveryAskInTheThreadIsSettled() {
        let offer = ThreadAskOptions.offered(
            openAsks: [
                InboxFixtures.openAsk(
                    id: "ask_settled",
                    messageID: "message_reply",
                    status: .answered,
                    threadAnchorMessageID: "message_anchor"
                ),
            ],
            anchor: anchor(ask: AskPresentation(status: .answered, answeredByName: "Marlow"))
        )

        #expect(offer == nil)
    }

    /// Until `ask.listOpen` lands, the anchor's own open Ask stands in, so a
    /// Thread opened straight onto an Ask never blinks its options on.
    @Test func fallsBackToTheAnchorWhileTheSnapshotIsUnread() throws {
        let offer = try #require(
            ThreadAskOptions.offered(
                openAsks: nil,
                anchor: anchor(ask: AskPresentation(status: .open, options: ["Friday"]))
            )
        )

        #expect(offer.id == "message_anchor")
        #expect(offer.options.options == ["Friday"])
    }

    private func anchor(ask: AskPresentation?) -> MessagePresentation {
        MessagePresentation(
            id: "message_anchor",
            author: MessageAuthorPresentation(id: "agent_blippy", name: "Blippy", avatarURL: nil),
            content: "Ship the iPhone build",
            createdAt: Date(timeIntervalSince1970: 1_800_000_000),
            attachments: [],
            ask: ask
        )
    }
}
