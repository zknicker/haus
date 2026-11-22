import Foundation
@testable import HausModels
import Testing

/// The Cloud Agent work link grammar (ADR 0044): the phone's mirror of
/// `cloud-agent-work-link.ts` and the `cloud-agent-work` reference parser.
struct WorkerMarkdownLinkTests {
    /// `cloudAgentWorkLinkLabelCases` in `cloud-agent-work-fixture.ts`.
    @Test(arguments: [
        ("Fix the flaky delivery test", "Fix the flaky delivery test"),
        ("Close ] the bracket]", "Close  the bracket"),
        ("Line one\r\nLine two\nthree", "Line one Line two three"),
        (#"C:\path\to"#, #"C:\\path\\to"#),
        ("Open [draft", #"Open \[draft"#),
        (#"trailing\"#, #"trailing\\"#),
        ("Café 修正 🚀 ✓", "Café 修正 🚀 ✓"),
        ("]]]", "Worker"),
        (" \r\n ", "Worker"),
        (String(repeating: "x", count: 120), String(repeating: "x", count: 120)),
        (String(repeating: "\\", count: 120), String(repeating: "\\\\", count: 120)),
    ])
    func labelsFollowTheSharedRule(title: String, label: String) {
        #expect(WorkerMarkdownLink.label(title: title) == label)
    }

    @Test func aLongTitleIsClippedToTheTitleLimit() {
        #expect(WorkerMarkdownLink.label(title: String(repeating: "y", count: 130)) == String(repeating: "y", count: 120))
    }

    @Test(arguments: ["Fix the flaky delivery test", #"C:\path\to"#, "Open [draft", #"trailing\"#, "Café 修正 🚀 ✓"])
    func aWrittenLinkParsesBackToItsTitleAndWork(title: String) throws {
        let content = "Linking it.\n\n\(WorkerMarkdownLink.format(title: title, workID: "caw_1"))"
        let link = try #require(WorkerMarkdownLink.occurrences(in: content).first)
        #expect(link.workID == "caw_1")
        #expect(link.label == title)
        #expect(String(content[link.range]) == WorkerMarkdownLink.format(title: title, workID: "caw_1"))
    }

    @Test func workIDsArePercentDecodedAndOtherSchemesAreNotWork() {
        #expect(WorkerMarkdownLink.workID(target: "worker://caw%2F1") == "caw/1")
        #expect(WorkerMarkdownLink.workID(target: " worker://caw_1 ") == "caw_1")
        #expect(WorkerMarkdownLink.workID(target: "worker://") == nil)
        #expect(WorkerMarkdownLink.workID(target: "chat://cht_1") == nil)
        #expect(WorkerMarkdownLink.format(title: "T", workID: "caw/1") == "[T](worker://caw%2F1)")
    }

    @Test func aLoneBackslashBeforeAnythingElseStays() {
        #expect(WorkerMarkdownLink.unescapedLabel(#"a\b\\c\[d\"#) == #"a\b\c[d\"#)
    }

    @Test func anImageIsNeverAWorkLink() {
        #expect(WorkerMarkdownLink.occurrences(in: "![T](worker://caw_1)").isEmpty)
    }

    // MARK: - Q1 elision

    @Test func hidesATrailingParagraphOfBackedLinks() {
        let content = "On it.\n\n[Fix tests](worker://caw_1)"
        #expect(WorkerMarkdownLink.elidingBackedTrailingParagraph(content, backedWorkIDs: ["caw_1"]) == "On it.")
    }

    @Test func hidesSeveralBackedLinksAndAWholeLinkOnlyMessage() {
        let several = "Two jobs.\n\n[A](worker://caw_1) [B](worker://caw_2)\n"
        #expect(WorkerMarkdownLink.elidingBackedTrailingParagraph(several, backedWorkIDs: ["caw_1", "caw_2"]) == "Two jobs.")
        let alone = "[A](worker://caw_1)"
        #expect(WorkerMarkdownLink.elidingBackedTrailingParagraph(alone, backedWorkIDs: ["caw_1"]) == "")
    }

    @Test func keepsForgedUnknownOrPartlyBackedLinks() {
        let forged = "On it.\n\n[Fix tests](worker://caw_forged)"
        #expect(WorkerMarkdownLink.elidingBackedTrailingParagraph(forged, backedWorkIDs: ["caw_1"]) == forged)
        let mixed = "On it.\n\n[A](worker://caw_1) [B](worker://caw_2)"
        #expect(WorkerMarkdownLink.elidingBackedTrailingParagraph(mixed, backedWorkIDs: ["caw_1"]) == mixed)
        #expect(WorkerMarkdownLink.elidingBackedTrailingParagraph(forged, backedWorkIDs: []) == forged)
    }

    @Test func keepsAParagraphWithAnythingButLinks() {
        let prose = "On it.\n\nSee [Fix tests](worker://caw_1) for status"
        #expect(WorkerMarkdownLink.elidingBackedTrailingParagraph(prose, backedWorkIDs: ["caw_1"]) == prose)
        let otherLink = "On it.\n\n[Fix tests](worker://caw_1) [#ops](chat://cht_ops)"
        #expect(WorkerMarkdownLink.elidingBackedTrailingParagraph(otherLink, backedWorkIDs: ["caw_1"]) == otherLink)
        let notLast = "[Fix tests](worker://caw_1)\n\nThen more words."
        #expect(WorkerMarkdownLink.elidingBackedTrailingParagraph(notLast, backedWorkIDs: ["caw_1"]) == notLast)
    }

    @Test func aParagraphIsSplitByABlankLineNotASingleBreak() {
        let sameParagraph = "On it.\n[Fix tests](worker://caw_1)"
        #expect(WorkerMarkdownLink.elidingBackedTrailingParagraph(sameParagraph, backedWorkIDs: ["caw_1"]) == sameParagraph)
        let spacedBlank = "On it.\n  \n[Fix tests](worker://caw_1)"
        #expect(WorkerMarkdownLink.elidingBackedTrailingParagraph(spacedBlank, backedWorkIDs: ["caw_1"]) == "On it.")
    }
}

/// The Message annotation and how every surface reads it.
struct ChatMessageWorkerTests {
    @Test func decodesTheAnnotationInLinkOrder() throws {
        let message = try WorkerFixture.message(
            content: "On it.\n\n[First](worker://caw_1)",
            annotation: [WorkerFixture.work("caw_2"), WorkerFixture.work("caw_1")]
        )
        #expect(message.cloudAgentWork.map(\.id) == ["caw_2", "caw_1"])
        #expect(message.displayContent == "On it.")
    }

    @Test func aServerWithoutLinksDecodesAnEmptyAnnotation() throws {
        let message = try WorkerFixture.message(content: "[Forged](worker://caw_1)", annotation: nil)
        #expect(message.cloudAgentWork.isEmpty)
        #expect(message.displayContent == "[Forged](worker://caw_1)")
    }

    @Test func aRetiredWorkBodyIsUnsupportedAndDrawsNoCard() throws {
        let stale = try WorkerFixture.message(
            content: "On it.",
            annotation: nil,
            legacyBody: WorkerFixture.work("caw_1")
        )
        #expect(stale.body == .unsupported("cloud-agent-work"))
        #expect(stale.cloudAgentWork.isEmpty)
        #expect(stale.displayContent == "On it.")
    }

    @Test func everyLoadedCopyOfAWorkIsFoundAcrossChats() throws {
        var store = TranscriptStore()
        let launch = try WorkerFixture.message(
            id: "m_launch", chatID: "cht_joy", content: "x", annotation: [WorkerFixture.work("caw_1")]
        )
        let linked = try WorkerFixture.message(
            id: "m_link", chatID: "cht_tech", content: "x", annotation: [WorkerFixture.work("caw_1")]
        )
        let other = try WorkerFixture.message(
            id: "m_other", chatID: "cht_tech", content: "x", annotation: nil, sequence: 2
        )
        store.write(TranscriptFixture.page([launch]), to: .chat("cht_joy"), as: .replace)
        store.write(TranscriptFixture.page([linked, other]), to: .chat("cht_tech"), as: .replace)

        #expect(Set(store.refreshes(carryingWorkers: ["caw_1"])) == [
            EntityRefresh(chatID: "cht_joy", messageID: "m_launch"),
            EntityRefresh(chatID: "cht_tech", messageID: "m_link"),
        ])
        #expect(store.refreshes(carryingWorkers: []).isEmpty)
    }
}

/// Live work updates and Chat deletion, as one coalesced batch asks for reads.
struct WorkerRealtimeEffectsTests {
    @Test func aWorkerUpdateRefreshesItsTaskAndRemembersTheWorker() {
        let effects = ChatRealtimeEffects([
            .cloudAgentWorkUpdated(WorkerUpdatedEvent(
                serverID: "srv", chatID: "cht_task_1", taskID: "task_1", workID: "caw_1"
            )),
            .cloudAgentWorkUpdated(WorkerUpdatedEvent(
                serverID: "srv", chatID: "cht_task_2", taskID: "task_2", workID: "caw_2"
            )),
        ], serverID: "srv")

        #expect(effects.cloudAgentWorkIDs == ["caw_1", "caw_2"])
        #expect(effects.cloudAgentWorkChatIDs == ["cht_task_1", "cht_task_2"])
        #expect(effects.changedTaskIDs == ["task_1", "task_2"])
        #expect(effects.entityRefreshes.isEmpty)
        #expect(effects.reloadsActiveWorkers)
    }

    @Test func aDeletedChatReloadsHappeningNow() {
        let deleted = ChatRealtimeEffects(
            [.lifecycle(ChatLifecycleEvent(serverID: "srv", chatID: "cht_joy", action: .deleted))],
            serverID: "srv"
        )
        #expect(deleted.deletedChatIDs == ["cht_joy"])
        #expect(deleted.reloadsActiveWorkers)

        let missing = ChatRealtimeEffects([.chatMissing(serverID: "srv", chatID: "cht_joy")], serverID: "srv")
        #expect(missing.reloadsActiveWorkers)

        let renamed = ChatRealtimeEffects(
            [.lifecycle(ChatLifecycleEvent(serverID: "srv", chatID: "cht_joy", action: .updated))],
            serverID: "srv"
        )
        #expect(!renamed.reloadsActiveWorkers)
    }
}

enum WorkerFixture {
    static func work(_ id: String) throws -> Worker {
        try HausJSON.decoder().decode(Worker.self, from: Data(workJSON(id).utf8))
    }

    static func message(
        id: String = "m_1",
        chatID: String = "chat_1",
        content: String,
        annotation: [Worker]?,
        legacyBody: Worker? = nil,
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
            object["workers"] = try annotation.map { try jsonObject($0) }
        }
        if let legacyBody {
            object["body"] = ["kind": "cloud-agent-work", "work": try jsonObject(legacyBody)]
        }
        let data = try JSONSerialization.data(withJSONObject: object)
        return try HausJSON.decoder().decode(ChatMessage.self, from: data)
    }

    private static func jsonObject(_ work: Worker) throws -> Any {
        try JSONSerialization.jsonObject(with: HausJSON.encoder().encode(work))
    }

    private static func workJSON(_ id: String) -> String {
        """
        {"activity":null,"agentId":"agent_forge","cancelRequestedAt":null,"chatId":"cht_joy",
         "createdAt":"2026-10-11T09:00:00.000Z","id":"\(id)","messageId":"m_launch",
         "job":{"followUp":null,"startedAt":null,"state":"working"},
         "place":{"kind":"cursor"},"providerUrl":null,"repository":"zknicker/haus",
         "turns":[],"startedAt":null,"startingRef":"main","status":"queued",
         "terminalAt":null,"title":"Work \(id)","updatedAt":"2026-10-11T09:00:00.000Z"}
        """
    }
}
