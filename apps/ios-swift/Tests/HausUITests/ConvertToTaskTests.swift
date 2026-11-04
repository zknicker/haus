import Foundation
import HausModels
@testable import HausUI
import Testing

/// What Convert to Task offers as a title, and what a stopped claim's row says.
struct ConvertToTaskTests {
    @Test func theTitleIsTheFirstLineThatSaysAnything() {
        let title = ConvertToTaskTitle.fromMessage(prose: "\n   \nRate-limit webhooks\n\nA leaked URL.")
        #expect(title == "Rate-limit webhooks")
    }

    @Test func theTitleReadsTheWayAQuoteDoes() {
        let title = ConvertToTaskTitle.fromMessage(prose: "## Ask [@Blippy](agent://a1) about **SEC-12**")
        #expect(title == "Ask @Blippy about SEC-12")
    }

    @Test func aLongLineCutsToWhatATitleHolds() {
        let title = ConvertToTaskTitle.fromMessage(prose: String(repeating: "a", count: 300))
        #expect(title.count == 200)
    }

    /// An attachment on its own has no words, so the person writes the title.
    @Test func aMessageWithNoWordsLeavesTheTitleBlank() {
        #expect(ConvertToTaskTitle.fromMessage(prose: "").isEmpty)
    }

    @Test func aStoppedClaimNamesItsPlaceAndADMIsDM() throws {
        let now = Date()
        let channel = try item(kind: "channel", name: "product")
        #expect(channel.stoppedClaimTitle == "Review the mobile release")
        #expect(channel.stoppedClaimDetail(now: now).hasPrefix("#product · "))

        let dm = try item(kind: "dm", name: nil)
        #expect(dm.stoppedClaimDetail(now: now).hasPrefix("DM · "))
    }

    @Test func onlyASettledReadHasClaimsToShow() throws {
        let claims = [try item(kind: "channel", name: "product")]

        #expect(AgentStoppedClaimsState.loading.claims.isEmpty)
        #expect(AgentStoppedClaimsState.failed("Nope").claims.isEmpty)
        #expect(AgentStoppedClaimsState.failed("Nope").failure == "Nope")
        #expect(AgentStoppedClaimsState.loaded(claims).claims == claims)
    }

    private func item(kind: String, name: String?) throws -> ClaimListItem {
        let chatName = name.map { "\"\($0)\"" } ?? "null"
        return try HausJSON.decoder().decode(ClaimListItem.self, from: Data(
            """
            {"chatKind":"\(kind)","chatName":\(chatName),"chatPeerUserId":null,
             "message":{"attachments":[],"author":{"kind":"human","userId":"u","profile":null},"chatId":"chat_1","content":"Review the **mobile** release","createdAt":"2026-09-10T17:00:00Z","id":"message_1","nonce":"n","runId":null,"sequence":8,"serverId":"s","claim":null},
             "claim":{"assigneeAgentId":"agent_1","chatId":"chat_1","claimedAt":null,"createdAt":"2026-09-10T17:59:00Z","createdByAgentId":"agent_1","createdByUserId":null,"labels":[],"live":false,"messageId":"message_1","number":4,"origin":"claimed","priority":"none","status":"in_progress","threadChatId":"thread_1","tier":"tracked","updatedAt":"2026-09-10T18:30:00Z","version":2},
             "threadSummary":{"anchorMessageId":"message_1","followed":false,"latestReplyAt":null,"recentReplies":[],"replyCount":0,"threadChatId":"thread_1","unreadCount":0}}
            """.utf8
        ))
    }
}
