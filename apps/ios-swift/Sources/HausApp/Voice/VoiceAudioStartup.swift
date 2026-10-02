import Foundation

enum VoiceAudioStartup {
    enum Failure: Error { case noCapture }

    static func waitForCapture(
        _ frames: AsyncThrowingStream<Void, Error>,
        timeout: Duration = .seconds(3)
    ) async throws {
        try await withThrowingTaskGroup(of: Void.self) { group in
            group.addTask {
                var iterator = frames.makeAsyncIterator()
                guard try await iterator.next() != nil else { throw Failure.noCapture }
                try Task.checkCancellation()
            }
            group.addTask {
                try await Task.sleep(for: timeout)
                throw Failure.noCapture
            }
            defer { group.cancelAll() }
            try await group.next()
        }
    }
}
