import XCTest

final class VoiceAudioStartupTests: XCTestCase {
    func testWaitsForCapturedAudio() async throws {
        let (frames, continuation) = AsyncThrowingStream<Void, Error>.makeStream()
        let producer = Task {
            try await Task.sleep(for: .milliseconds(20))
            continuation.yield(())
            continuation.finish()
        }
        try await VoiceAudioStartup.waitForCapture(frames)
        try await producer.value
    }

    func testSilentEngineTimesOut() async {
        let (frames, continuation) = AsyncThrowingStream<Void, Error>.makeStream()
        defer { continuation.finish() }
        do {
            try await VoiceAudioStartup.waitForCapture(frames, timeout: .milliseconds(20))
            XCTFail("Startup must fail when the engine delivers no audio.")
        } catch { XCTAssertTrue(error is VoiceAudioStartup.Failure) }
    }

    func testHangupWhileStartingDoesNotConnect() async {
        let (frames, continuation) = AsyncThrowingStream<Void, Error>.makeStream()
        continuation.finish()
        do {
            try await VoiceAudioStartup.waitForCapture(frames)
            XCTFail("An ended capture must not connect.")
        } catch { XCTAssertTrue(error is VoiceAudioStartup.Failure) }
    }

    func testCancellationStopsWaiting() async {
        let (frames, continuation) = AsyncThrowingStream<Void, Error>.makeStream()
        defer { continuation.finish() }
        let startup = Task { try await VoiceAudioStartup.waitForCapture(frames) }
        startup.cancel()
        do {
            try await startup.value
            XCTFail("Cancelled startup must not connect.")
        } catch { }
    }
}
