import Testing
@testable import HausModels

@Suite("Retry backoff")
struct RetryBackoffTests {
    @Test("Doubles from one second and caps at a minute")
    func doublesAndCaps() {
        #expect(RetryBackoff.delay(attempt: 0) == .seconds(1))
        #expect(RetryBackoff.delay(attempt: 3) == .seconds(8))
        #expect(RetryBackoff.delay(attempt: 6) == .seconds(60))
        #expect(RetryBackoff.delay(attempt: 40) == .seconds(60))
        #expect(RetryBackoff.delay(attempt: -1) == .seconds(1))
    }
}
