import Foundation
import Testing
@testable import HausTransport

/// A send is replayed by nonce through a bad link and reports failure only
/// once the retries are spent, so a slow or flaky Server never marks a row
/// "Not sent" on the first hiccup.
@Suite("Idempotent retry")
struct IdempotentRetryTests {
    actor Attempts {
        var count = 0
        var slept: [Duration] = []
        func next() -> Int { count += 1; return count }
        func sleep(_ delay: Duration) { slept.append(delay) }
    }

    @Test("A timeout is retried and the eventual answer returned")
    func transientFailureRecovers() async throws {
        let attempts = Attempts()
        let result = try await IdempotentRetry.run(
            delays: [.seconds(1), .seconds(3)],
            sleep: { await attempts.sleep($0) }
        ) {
            if await attempts.next() < 3 {
                throw TRPCClientError.transport("timed out", urlErrorCode: .timedOut)
            }
            return "receipt"
        }
        #expect(result == "receipt")
        #expect(await attempts.count == 3)
        #expect(await attempts.slept == [.seconds(1), .seconds(3)])
    }

    @Test("A send fails only after every retry is spent")
    func exhaustedRetriesFail() async {
        let attempts = Attempts()
        await #expect(throws: TRPCClientError.self) {
            try await IdempotentRetry.run(delays: [.zero, .zero], sleep: { _ in }) {
                _ = await attempts.next()
                throw TRPCClientError.transport("offline", urlErrorCode: .notConnectedToInternet)
            }
        }
        #expect(await attempts.count == 3)
    }

    @Test("Anything Server answered fails at once")
    func serverAnswersAreNotRetried() async {
        let attempts = Attempts()
        await #expect(throws: TRPCError.self) {
            try await IdempotentRetry.run(delays: [.zero, .zero], sleep: { _ in }) {
                _ = await attempts.next()
                throw TRPCError(message: "Forbidden", code: -32003, httpStatus: 403)
            }
        }
        #expect(await attempts.count == 1)
    }

    @Test("Transient failures are the link's, never the request's")
    func classification() {
        #expect(IdempotentRetry.isTransient(TRPCClientError.transport("lost", urlErrorCode: .networkConnectionLost)))
        #expect(IdempotentRetry.isTransient(TRPCClientError.invalidResponse(status: 503, body: "")))
        #expect(IdempotentRetry.isTransient(TRPCError(message: "Bad gateway", httpStatus: 502)))
        #expect(!IdempotentRetry.isTransient(TRPCClientError.invalidResponse(status: 400, body: "")))
        #expect(!IdempotentRetry.isTransient(TRPCClientError.decoding("bad json")))
        #expect(!IdempotentRetry.isTransient(TRPCError(message: "Internal", httpStatus: 500)))
        #expect(!IdempotentRetry.isTransient(CancellationError()))
    }
}
