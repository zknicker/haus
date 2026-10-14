import Foundation
import Testing
@testable import HausModels

@Suite struct CloudAgentPendingInputTests {
    @Test func pendingInputRemainsActiveAndDecodesTheJob() throws {
        let status = try JSONDecoder().decode(CloudAgentStatus.self, from: Data(#""pending_input""#.utf8))
        #expect(status.isActive)
        let job = try JSONDecoder().decode(CloudAgentJob.self, from: Data(#"{"state":"pending-input","startedAt":null,"followUp":null}"#.utf8))
        #expect(job.state == .pendingInput)
        #expect(job.settledAt == nil)
        let encoded = try JSONEncoder().encode(job)
        #expect(try JSONDecoder().decode(CloudAgentJob.self, from: encoded) == job)
    }
}
