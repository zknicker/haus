import Foundation
@testable import HausUI
import Testing

/// Thread mentions arrive as `chat://<chatId>?thread=<anchorMessageId>`. The
/// phone used to read everything after `chat://` as a channel id, so a Thread
/// chip drew as a channel that resolved to nothing.
@MainActor
struct ThreadReferenceTests {
    @Test func readsBothIdsOutOfTheThreadForm() throws {
        let thread = try #require(ThreadReferenceTarget(wireTarget: "chat://cht_1?thread=msg_2"))
        #expect(thread.chatID == "cht_1")
        #expect(thread.anchorMessageID == "msg_2")

        let encoded = try #require(ThreadReferenceTarget(wireTarget: "chat://cht%3A1?thread=msg%3A2"))
        #expect(encoded.chatID == "cht:1")
        #expect(encoded.anchorMessageID == "msg:2")
    }

    @Test func refusesAnythingButExactlyTheThreadForm() {
        for target in [
            "chat://cht_1",
            "chat://?thread=msg_2",
            "chat://cht_1?thread=",
            "chat://cht_1?thread=msg_2&x=1",
            "chat://cht_1?thread=msg_2#top",
            "chat://cht_1?other=msg_2",
            "https://haus.dev/chat://cht_1?thread=msg_2",
        ] {
            #expect(ThreadReferenceTarget(wireTarget: target) == nil, "target \(target)")
        }
    }

    @Test func theWireFormReadsAThreadAndStillReadsAChannel() {
        let thread = RichReferenceWireForm.read(target: "chat://cht_1?thread=msg_2", text: "#plan")
        #expect(thread?.kind == .thread)
        #expect(thread?.id == "chat://cht_1?thread=msg_2")

        let channel = RichReferenceWireForm.read(target: "chat://cht_1", text: "#product")
        #expect(channel?.kind == .channel)
        #expect(channel?.id == "cht_1")
    }

    /// The shared parser refuses any other query, so the App renders it as a
    /// plain link rather than a channel with a bogus id.
    @Test func anyOtherQueryIsNotAReference() {
        #expect(RichReferenceWireForm.read(target: "chat://cht_1?tab=files", text: "files") == nil)
        #expect(
            RichMessageParser.parse("[files](chat://cht_1?tab=files)") { _, _, _ in nil }
                == [.link(text: "files", target: "chat://cht_1?tab=files")]
        )
    }

    @Test func aThreadChipIsAnInAppLinkThatRoutesToItsThread() throws {
        let segments = RichMessageParser.parse("See [#plan](chat://cht_1?thread=msg_2).") { _, _, _ in nil }
        guard case .reference(let reference) = segments.first(where: {
            if case .reference = $0 { true } else { false }
        }) else {
            Issue.record("No thread reference parsed")
            return
        }
        let url = try #require(reference.activationURL)

        var opened: ThreadReferenceTarget?
        InAppReferenceRoutes.openThread = { opened = $0 }
        defer { InAppReferenceRoutes.openThread = nil }
        let route = try #require(InAppReferenceRoutes.action(for: url))
        route()
        #expect(opened == ThreadReferenceTarget(chatID: "cht_1", anchorMessageID: "msg_2"))

        #expect(InAppReferenceRoutes.action(for: URL(string: "https://haus.dev")!) == nil)
    }

    @Test func titleIsTheAnchorsFirstLineCutAt64() {
        #expect(ThreadReferenceTarget.title(anchorContent: "\n  \n**Launch** plan for [#product](chat://c)\nmore") == "Launch plan for #product")
        #expect(ThreadReferenceTarget.title(anchorContent: "   ") == "Thread")
        let long = String(repeating: "word ", count: 20)
        let title = ThreadReferenceTarget.title(anchorContent: long)
        #expect(title.count == 64)
        #expect(title.hasSuffix("…"))
    }
}
