import Testing
@testable import HausModels

/// A failed send stays in the transcript as the viewer's own row: sending,
/// then failed, then sending again on Try Again, or gone on Delete.
@Suite("Optimistic send state")
struct OptimisticSendStateTests {
    struct Row: OptimisticSendRow, Equatable {
        let nonce: String
        var sendState: OptimisticSendState = .sending
    }

    @Test("A failed send keeps its row, marked failed, under whatever key holds it")
    func failureKeepsTheRow() {
        var rows = ["cht_1": [Row(nonce: "a")], "thread-pending:m": [Row(nonce: "b")]]
        #expect(OptimisticMessageRow.markFailed(nonce: "b", in: &rows))
        #expect(rows["thread-pending:m"] == [Row(nonce: "b", sendState: .failed)])
        #expect(rows["cht_1"] == [Row(nonce: "a")])
        #expect(!OptimisticMessageRow.markFailed(nonce: "gone", in: &rows))
    }

    @Test("Try Again moves a failed row back to sending, once")
    func retryIsSingleFlight() throws {
        var rows = ["cht_1": [Row(nonce: "a", sendState: .failed)]]
        let retried = try #require(OptimisticMessageRow.beginRetry(nonce: "a", in: &rows))
        #expect(retried.key == "cht_1")
        #expect(retried.row == Row(nonce: "a", sendState: .sending))
        #expect(OptimisticMessageRow.beginRetry(nonce: "a", in: &rows) == nil)
        OptimisticMessageRow.markFailed(nonce: "a", in: &rows)
        #expect(OptimisticMessageRow.beginRetry(nonce: "a", in: &rows)?.row.sendState == .sending)
    }

    @Test("Delete removes only a failed row, and an emptied key")
    func deleteRemovesOnlyFailedRows() {
        var rows = ["cht_1": [Row(nonce: "a"), Row(nonce: "b", sendState: .failed)]]
        #expect(OptimisticMessageRow.removeFailed(nonce: "a", in: &rows) == nil)
        #expect(OptimisticMessageRow.removeFailed(nonce: "b", in: &rows)?.nonce == "b")
        #expect(rows["cht_1"] == [Row(nonce: "a")])
        OptimisticMessageRow.markFailed(nonce: "a", in: &rows)
        OptimisticMessageRow.removeFailed(nonce: "a", in: &rows)
        #expect(rows["cht_1"] == nil)
    }
}
