import Foundation
@testable import HausModels
import Testing

/// The Cloud Agent work link grammar (ADR 0044): the phone's mirror of
/// `cloud-agent-work-link.ts` and the `cloud-agent-work` reference parser.
struct CloudAgentWorkLinkTests {
    /// `cloudAgentWorkLinkLabelCases` in `cloud-agent-work-fixture.ts`.
    @Test(arguments: [
        ("Fix the flaky delivery test", "Fix the flaky delivery test"),
        ("Close ] the bracket]", "Close  the bracket"),
        ("Line one\r\nLine two\nthree", "Line one Line two three"),
        (#"C:\path\to"#, #"C:\\path\\to"#),
        ("Open [draft", #"Open \[draft"#),
        (#"trailing\"#, #"trailing\\"#),
        ("Café 修正 🚀 ✓", "Café 修正 🚀 ✓"),
        ("]]]", "Cloud Agent work"),
        (" \r\n ", "Cloud Agent work"),
        (String(repeating: "x", count: 120), String(repeating: "x", count: 120)),
        (String(repeating: "\\", count: 120), String(repeating: "\\\\", count: 120)),
    ])
    func labelsFollowTheSharedRule(title: String, label: String) {
        #expect(CloudAgentWorkLink.label(title: title) == label)
    }

    @Test func aLongTitleIsClippedToTheTitleLimit() {
        #expect(CloudAgentWorkLink.label(title: String(repeating: "y", count: 130)) == String(repeating: "y", count: 120))
    }

    @Test(arguments: ["Fix the flaky delivery test", #"C:\path\to"#, "Open [draft", #"trailing\"#, "Café 修正 🚀 ✓"])
    func aWrittenLinkParsesBackToItsTitleAndWork(title: String) throws {
        let content = "Linking it.\n\n\(CloudAgentWorkLink.format(title: title, workID: "caw_1"))"
        let link = try #require(CloudAgentWorkLink.occurrences(in: content).first)
        #expect(link.workID == "caw_1")
        #expect(link.label == title)
        #expect(String(content[link.range]) == CloudAgentWorkLink.format(title: title, workID: "caw_1"))
    }

    @Test func workIDsArePercentDecodedAndOtherSchemesAreNotWork() {
        #expect(CloudAgentWorkLink.workID(target: "cloud-agent://caw%2F1") == "caw/1")
        #expect(CloudAgentWorkLink.workID(target: " cloud-agent://caw_1 ") == "caw_1")
        #expect(CloudAgentWorkLink.workID(target: "cloud-agent://") == nil)
        #expect(CloudAgentWorkLink.workID(target: "chat://cht_1") == nil)
        #expect(CloudAgentWorkLink.format(title: "T", workID: "caw/1") == "[T](cloud-agent://caw%2F1)")
    }

    @Test func aLoneBackslashBeforeAnythingElseStays() {
        #expect(CloudAgentWorkLink.unescapedLabel(#"a\b\\c\[d\"#) == #"a\b\c[d\"#)
    }

    @Test func anImageIsNeverAWorkLink() {
        #expect(CloudAgentWorkLink.occurrences(in: "![T](cloud-agent://caw_1)").isEmpty)
    }

    // MARK: - Q1 elision

    @Test func hidesATrailingParagraphOfBackedLinks() {
        let content = "On it.\n\n[Fix tests](cloud-agent://caw_1)"
        #expect(CloudAgentWorkLink.elidingBackedTrailingParagraph(content, backedWorkIDs: ["caw_1"]) == "On it.")
    }

    @Test func hidesSeveralBackedLinksAndAWholeLinkOnlyMessage() {
        let several = "Two jobs.\n\n[A](cloud-agent://caw_1) [B](cloud-agent://caw_2)\n"
        #expect(CloudAgentWorkLink.elidingBackedTrailingParagraph(several, backedWorkIDs: ["caw_1", "caw_2"]) == "Two jobs.")
        let alone = "[A](cloud-agent://caw_1)"
        #expect(CloudAgentWorkLink.elidingBackedTrailingParagraph(alone, backedWorkIDs: ["caw_1"]) == "")
    }

    @Test func keepsForgedUnknownOrPartlyBackedLinks() {
        let forged = "On it.\n\n[Fix tests](cloud-agent://caw_forged)"
        #expect(CloudAgentWorkLink.elidingBackedTrailingParagraph(forged, backedWorkIDs: ["caw_1"]) == forged)
        let mixed = "On it.\n\n[A](cloud-agent://caw_1) [B](cloud-agent://caw_2)"
        #expect(CloudAgentWorkLink.elidingBackedTrailingParagraph(mixed, backedWorkIDs: ["caw_1"]) == mixed)
        #expect(CloudAgentWorkLink.elidingBackedTrailingParagraph(forged, backedWorkIDs: []) == forged)
    }

    @Test func keepsAParagraphWithAnythingButLinks() {
        let prose = "On it.\n\nSee [Fix tests](cloud-agent://caw_1) for status"
        #expect(CloudAgentWorkLink.elidingBackedTrailingParagraph(prose, backedWorkIDs: ["caw_1"]) == prose)
        let otherLink = "On it.\n\n[Fix tests](cloud-agent://caw_1) [#ops](chat://cht_ops)"
        #expect(CloudAgentWorkLink.elidingBackedTrailingParagraph(otherLink, backedWorkIDs: ["caw_1"]) == otherLink)
        let notLast = "[Fix tests](cloud-agent://caw_1)\n\nThen more words."
        #expect(CloudAgentWorkLink.elidingBackedTrailingParagraph(notLast, backedWorkIDs: ["caw_1"]) == notLast)
    }

    @Test func aParagraphIsSplitByABlankLineNotASingleBreak() {
        let sameParagraph = "On it.\n[Fix tests](cloud-agent://caw_1)"
        #expect(CloudAgentWorkLink.elidingBackedTrailingParagraph(sameParagraph, backedWorkIDs: ["caw_1"]) == sameParagraph)
        let spacedBlank = "On it.\n  \n[Fix tests](cloud-agent://caw_1)"
        #expect(CloudAgentWorkLink.elidingBackedTrailingParagraph(spacedBlank, backedWorkIDs: ["caw_1"]) == "On it.")
    }
}

/// The Message annotation and how every surface reads it.
struct ChatMessageCloudAgentWorkTests {
    @Test func decodesTheAnnotationInLinkOrder() throws {
        let message = try CloudAgentWorkFixture.message(
            content: "On it.\n\n[First](cloud-agent://caw_1)",
            annotation: [CloudAgentWorkFixture.work("caw_2"), CloudAgentWorkFixture.work("caw_1")]
        )
        #expect(message.cloudAgentWork.map(\.id) == ["caw_2", "caw_1"])
        #expect(message.linkedCloudAgentWork.map(\.id) == ["caw_2", "caw_1"])
        #expect(message.displayContent == "On it.")
        #expect(message.linkedCloudAgentWorkTitle == "Work caw_2")
    }

    @Test func aServerWithoutLinksDecodesAnEmptyAnnotation() throws {
        let message = try CloudAgentWorkFixture.message(content: "[Forged](cloud-agent://caw_1)", annotation: nil)
        #expect(message.cloudAgentWork.isEmpty)
        #expect(message.displayContent == "[Forged](cloud-agent://caw_1)")
        #expect(message.linkedCloudAgentWorkTitle == nil)
    }

    @Test func aPreLinkWorkBodyStillDrawsItsCardOnce() throws {
        let legacy = try CloudAgentWorkFixture.message(
            content: "On it.",
            annotation: nil,
            legacyBody: CloudAgentWorkFixture.work("caw_1")
        )
        #expect(legacy.linkedCloudAgentWork.map(\.id) == ["caw_1"])

        let both = try CloudAgentWorkFixture.message(
            content: "On it.",
            annotation: [CloudAgentWorkFixture.work("caw_1")],
            legacyBody: CloudAgentWorkFixture.work("caw_1")
        )
        #expect(both.linkedCloudAgentWork.map(\.id) == ["caw_1"])
    }

    @Test func everyLoadedCopyOfAWorkIsFoundAcrossChats() throws {
        var store = TranscriptStore()
        let launch = try CloudAgentWorkFixture.message(
            id: "m_launch", chatID: "cht_joy", content: "x", annotation: [CloudAgentWorkFixture.work("caw_1")]
        )
        let linked = try CloudAgentWorkFixture.message(
            id: "m_link", chatID: "cht_tech", content: "x", annotation: [CloudAgentWorkFixture.work("caw_1")]
        )
        let other = try CloudAgentWorkFixture.message(
            id: "m_other", chatID: "cht_tech", content: "x", annotation: nil, sequence: 2
        )
        store.write(TranscriptFixture.page([launch]), to: .chat("cht_joy"), as: .replace)
        store.write(TranscriptFixture.page([linked, other]), to: .chat("cht_tech"), as: .replace)

        #expect(Set(store.refreshes(carryingCloudAgentWork: ["caw_1"])) == [
            EntityRefresh(chatID: "cht_joy", messageID: "m_launch"),
            EntityRefresh(chatID: "cht_tech", messageID: "m_link"),
        ])
        #expect(store.refreshes(carryingCloudAgentWork: []).isEmpty)
        #expect(store.cloudAgentWorkIDs(linkedIn: "cht_joy") == ["caw_1"])
        #expect(store.cloudAgentWorkIDs(linkedIn: "cht_none").isEmpty)
    }

    @Test func workListsNamingAWorkAreFoundInEveryChat() throws {
        let row = ThreadCloudAgentWork(anchorMessageId: "m_1", work: try CloudAgentWorkFixture.work("caw_1"))
        let other = ThreadCloudAgentWork(anchorMessageId: "m_2", work: try CloudAgentWorkFixture.work("caw_2"))
        let lists = ["cht_joy": [row], "cht_tech": [other, row], "cht_ops": [other]]
        #expect(ThreadCloudAgentWork.chatIDs(listing: ["caw_1"], in: lists) == ["cht_joy", "cht_tech"])
        #expect(ThreadCloudAgentWork.chatIDs(listing: [], in: lists).isEmpty)
    }
}

/// Live work updates and Chat deletion, as one coalesced batch asks for reads.
struct CloudAgentWorkRealtimeEffectsTests {
    @Test func aWorkUpdateRefreshesItsLinkAndRemembersTheWork() {
        let effects = ChatRealtimeEffects([
            .cloudAgentWorkUpdated(CloudAgentWorkUpdatedEvent(
                serverID: "srv", chatID: "cht_tech", messageID: "m_link", workID: "caw_1"
            )),
            .cloudAgentWorkUpdated(CloudAgentWorkUpdatedEvent(
                serverID: "srv", chatID: "thr_1", parentChatID: "cht_joy", messageID: "m_reply", workID: "caw_1"
            )),
        ], serverID: "srv")

        #expect(effects.cloudAgentWorkIDs == ["caw_1"])
        #expect(effects.cloudAgentWorkChatIDs == ["cht_tech", "thr_1", "cht_joy"])
        #expect(effects.entityRefreshes == [
            EntityRefresh(chatID: "cht_tech", messageID: "m_link"),
            EntityRefresh(chatID: "thr_1", messageID: "m_reply"),
        ])
        #expect(effects.reloadsActiveCloudAgentWork)
    }

    @Test func aDeletedChatReloadsHappeningNow() {
        let deleted = ChatRealtimeEffects(
            [.lifecycle(ChatLifecycleEvent(serverID: "srv", chatID: "cht_joy", action: .deleted))],
            serverID: "srv"
        )
        #expect(deleted.deletedChatIDs == ["cht_joy"])
        #expect(deleted.reloadsActiveCloudAgentWork)

        let missing = ChatRealtimeEffects([.chatMissing(serverID: "srv", chatID: "cht_joy")], serverID: "srv")
        #expect(missing.reloadsActiveCloudAgentWork)

        let renamed = ChatRealtimeEffects(
            [.lifecycle(ChatLifecycleEvent(serverID: "srv", chatID: "cht_joy", action: .updated))],
            serverID: "srv"
        )
        #expect(!renamed.reloadsActiveCloudAgentWork)
    }
}

enum CloudAgentWorkFixture {
    static func work(_ id: String) throws -> CloudAgentWork {
        try HausJSON.decoder().decode(CloudAgentWork.self, from: Data(workJSON(id).utf8))
    }

    static func message(
        id: String = "m_1",
        chatID: String = "chat_1",
        content: String,
        annotation: [CloudAgentWork]?,
        legacyBody: CloudAgentWork? = nil,
        sequence: Int = 1
    ) throws -> ChatMessage {
        var object: [String: Any] = [
            "attachments": [],
            "author": ["agentId": "agent_1", "kind": "agent"],
            "chatId": chatID,
            "content": content,
            "createdAt": "2026-10-11T09:00:00Z",
            "id": id,
            "nonce": "nonce_\(id)",
            "runId": NSNull(),
            "sequence": sequence,
            "serverId": "server_1",
        ]
        if let annotation {
            object["cloudAgentWork"] = try annotation.map { try jsonObject($0) }
        }
        if let legacyBody {
            object["body"] = ["kind": "cloud-agent-work", "work": try jsonObject(legacyBody)]
        }
        let data = try JSONSerialization.data(withJSONObject: object)
        return try HausJSON.decoder().decode(ChatMessage.self, from: data)
    }

    private static func jsonObject(_ work: CloudAgentWork) throws -> Any {
        try JSONSerialization.jsonObject(with: HausJSON.encoder().encode(work))
    }

    private static func workJSON(_ id: String) -> String {
        """
        {"activity":null,"agentId":"agent_forge","cancelRequestedAt":null,"chatId":"cht_joy",
         "createdAt":"2026-10-11T09:00:00.000Z","id":"\(id)","messageId":"m_launch",
         "job":{"followUp":null,"startedAt":null,"state":"working"},
         "provider":"cursor","providerUrl":null,"repository":"zknicker/haus",
         "runs":[],"startedAt":null,"startingRef":"main","status":"queued",
         "terminalAt":null,"title":"Work \(id)","updatedAt":"2026-10-11T09:00:00.000Z"}
        """
    }
}
