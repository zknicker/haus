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
        #expect(ask.statusText == "Open")
        #expect(ask.options == ["Yes, rename it", "Keep #product", "Not now"])
    }

    /// A settled Ask names who answered, because the first answer wins
    /// permanently and that author is what a reader scanning back needs.
    @Test func namesWhoAnsweredOnceTheAskIsSettled() throws {
        let human = try #require(
            AskPresentation.present(
                try body(answeredBy: #"{"id":"user_1","kind":"user"}"#, status: "answered"),
                actor: directory
            )
        )
        #expect(human.status == .answered)
        #expect(human.statusText == "Answered by Zach")

        let agent = try #require(
            AskPresentation.present(
                try body(answeredBy: #"{"id":"agent_marlow","kind":"agent"}"#, status: "answered"),
                actor: directory
            )
        )
        #expect(agent.statusText == "Answered by Marlow")
    }

    /// An answerer nobody can resolve still reads as settled; only the name is
    /// missing.
    @Test func readsAnUnresolvableAnswererAsUnknown() throws {
        let ask = try #require(
            AskPresentation.present(
                try body(answeredBy: #"{"id":"user_gone","kind":"user"}"#, status: "answered"),
                actor: directory
            )
        )

        #expect(ask.statusText == "Answered by Unknown")
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
