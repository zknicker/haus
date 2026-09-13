import Foundation
import HausModels
import Testing
@testable import HausUI

@Suite struct AskPresentationTests {
    @Test func marksAnAskBodyWithItsAddresseeAndOpenStatus() throws {
        let ask = try #require(
            AskPresentation.present(try body(), actor: directory)
        )

        #expect(ask.status == .open)
        #expect(ask.addressee?.name == "Zach")
        #expect(ask.options == ["Yes, rename it", "Keep #product", "Not now"])
        // The open line is the word, whose turn it is, and what it waits for.
        #expect(AskPresentation.markerLabel == "Ask")
        #expect(AskPresentation.awaitingAnswer == "Awaiting answer")
    }

    /// A settled Ask still projects — the marker and the card are what stop
    /// drawing, not the record they read.
    @Test func readsASettledAskAsAnsweredAndDrawsNothing() throws {
        let human = try #require(
            AskPresentation.present(
                try body(answeredBy: #"{"id":"user_1","kind":"user"}"#, status: "answered"),
                actor: directory
            )
        )

        #expect(human.status == .answered)
        #expect(human.addressee?.name == "Zach")
    }

    /// The card leads with the decision and whose it is; the question itself is
    /// the Message above it and is never repeated.
    @Test func titlesTheAnswerCardWithItsAddressee() throws {
        let ask = try #require(AskPresentation.present(try body(), actor: directory))

        #expect(AskPresentation.answerCardTitle(addressee: ask.addressee) == "Ask for Zach")
        // An addressee who is no longer resolvable is a missing face, not a
        // missing Ask: the card still names what it is.
        #expect(AskPresentation.answerCardTitle(addressee: nil) == "Ask")
    }

    /// Only an `ask` body earns a marker; every other body kind wears none.
    @Test func marksNothingButAnAskBody() throws {
        #expect(AskPresentation.present(.text, actor: directory) == nil)
        #expect(AskPresentation.present(.unsupported("reminder"), actor: directory) == nil)
    }

    @Test func carriesAnOpenQuestionWithNoOptions() throws {
        let ask = try #require(
            AskPresentation.present(try body(options: "[]"), actor: directory)
        )

        #expect(ask.options.isEmpty)
    }
}

private func directory(agentID: String?, userID: String?) -> MessageAuthorPresentation? {
    let names = ["user_1": "Zach", "agent_marlow": "Marlow"]
    guard let id = agentID ?? userID, let name = names[id] else { return nil }
    return MessageAuthorPresentation(id: id, name: name, avatarURL: nil)
}

private func body(
    answeredBy: String = "null",
    options: String = #"["Yes, rename it","Keep #product","Not now"]"#,
    status: String = "open"
) throws -> ChatMessageBody {
    let json = """
    {"ask":{"addresseeUserId":"user_1","agentId":"agent_marlow","answerMessageId":null,
     "answeredAt":null,"answeredBy":\(answeredBy),"chatId":"chat_product",
     "createdAt":"2026-09-10T18:04:00.000Z","id":"ask_1","messageId":"message_ask",
     "options":\(options),"status":"\(status)",
     "summary":"Two channels now carry release work.",
     "title":"Rename #product to #launches?"},"kind":"ask"}
    """
    return try HausJSON.decoder().decode(ChatMessageBody.self, from: Data(json.utf8))
}
