import Foundation
import Testing
@testable import HausModels

/// The transcript a send moves through, as the ids the list is handed: the
/// durable page as Server ordered it, then the optimistic rows it does not
/// account for. Pending is invisible, so the only things that may change are
/// the ones Server actually changed.
@Suite("Optimistic transcript")
struct OptimisticTranscriptTests {
    struct Row: OptimisticSendRow, Equatable {
        let nonce: String
        var serverMessageID: String?
        var sendState: OptimisticSendState = .sending

        var id: String { OptimisticMessageRow.id(nonce: nonce, serverMessageID: serverMessageID) }
    }

    @Test("Pending to confirmed keeps one row, in place, under one id")
    func confirmationSwapsInPlace() {
        let history = [message("m1", sequence: 1)]
        var rows = [Row(nonce: "n")]

        let sent = transcript(history, rows)
        rows[0].serverMessageID = "m2"
        let receipted = transcript(history, rows)
        let landed = transcript(history + [message("m2", nonce: "n", sequence: 2)], rows)

        #expect(sent == ["m1", "pending:n"])
        // The receipt names the row before the page carries it, so the durable
        // row arrives under the id the list already has: no remove, no insert.
        #expect(receipted == ["m1", "m2"])
        #expect(landed == receipted)
        #expect(OptimisticMessageRow.unsettled(rows, page: history + [message("m2", nonce: "n", sequence: 2)]).isEmpty)
    }

    @Test("A message that lands while the send is in flight sits above it, then stays there")
    func interleavedIncomingMessage() {
        var rows = [Row(nonce: "n")]
        let other = message("agent-reply", sequence: 2)

        let whilePending = transcript([message("m1", sequence: 1), other], rows)
        rows[0].serverMessageID = "mine"
        let confirmed = transcript(
            [message("m1", sequence: 1), other, message("mine", nonce: "n", sequence: 3)],
            rows
        )

        #expect(whilePending == ["m1", "agent-reply", "pending:n"])
        #expect(confirmed == ["m1", "agent-reply", "mine"])
    }

    @Test("A page committed after this send places it by sequence, with no duplicate")
    func pageCarryingBothPlacesBySequence() {
        let rows = [Row(nonce: "n", serverMessageID: "mine")]
        let page = [
            message("m1", sequence: 1),
            message("mine", nonce: "n", sequence: 2),
            message("agent-reply", sequence: 3),
        ]

        #expect(transcript(page, rows) == ["m1", "mine", "agent-reply"])
    }

    @Test("Rapid sends keep send order, and each retires only with its own message")
    func rapidSendsRetireIndependently() {
        let rows = [Row(nonce: "a", serverMessageID: "ma"), Row(nonce: "b")]
        let page = [message("m1", sequence: 1), message("ma", nonce: "a", sequence: 2)]

        #expect(transcript([message("m1", sequence: 1)], rows) == ["m1", "ma", "pending:b"])
        #expect(transcript(page, rows) == ["m1", "ma", "pending:b"])
    }

    @Test("Pending to failed to retry keeps the row's place and identity, and retires on landing")
    func failedRetryReplaysTheSameRow() throws {
        let history = [message("m1", sequence: 1)]
        var rowsByChat = ["chat": [Row(nonce: "n")]]

        let pending = transcript(history, rowsByChat["chat"]!)
        OptimisticMessageRow.markFailed(nonce: "n", in: &rowsByChat)
        let failed = transcript(history, rowsByChat["chat"]!)
        let retry = try #require(OptimisticMessageRow.beginRetry(nonce: "n", in: &rowsByChat))
        let retrying = transcript(history, rowsByChat["chat"]!)

        #expect(pending == ["m1", "pending:n"])
        #expect(failed == pending)
        #expect(retrying == pending)
        #expect(retry.row.nonce == "n")
        #expect(rowsByChat["chat"]?.first?.sendState == .sending)

        // The first attempt had in fact landed: the replayed nonce is what the
        // page carries, so the row retires instead of doubling.
        let landed = history + [message("m2", nonce: "n", sequence: 2)]
        #expect(transcript(landed, rowsByChat["chat"]!) == ["m1", "m2"])
    }

    @Test("A failed row still retires once its message is on the page")
    func failedRowRetiresWhenItsMessageLands() {
        let rows = [Row(nonce: "n", sendState: .failed)]
        #expect(OptimisticMessageRow.unsettled(rows, page: [message("m2", nonce: "n", sequence: 2)]).isEmpty)
    }

    private func transcript(_ page: [ChatMessage], _ rows: [Row]) -> [String] {
        page.map(\.id) + OptimisticMessageRow.unsettled(rows, page: page).map(\.id)
    }

    private func message(_ id: String, nonce: String? = nil, sequence: Int) -> ChatMessage {
        ChatMessage(
            attachments: [],
            author: .human(profile: nil, userID: "user-1"),
            body: .text,
            cause: nil,
            chatID: "chat-1",
            content: "hello",
            createdAt: Date(timeIntervalSince1970: TimeInterval(sequence)),
            id: id,
            nonce: nonce ?? "nonce-\(id)",
            reply: nil,
            runID: nil,
            sequence: sequence,
            serverID: "server-1",
            sessionGeneration: nil,
            task: nil
        )
    }
}
