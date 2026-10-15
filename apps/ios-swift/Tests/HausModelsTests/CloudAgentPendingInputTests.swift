import Foundation
import Testing
@testable import HausModels

@Suite struct CloudAgentPendingInputTests {
    @Test func pendingInputIsASettledStatus() throws {
        let status = try JSONDecoder().decode(CloudAgentStatus.self, from: Data(#""pending_input""#.utf8))
        #expect(status == .pendingInput)
        #expect(!status.isActive)
    }

    @Test func pendingInputJobDecodesItsQuestionAndRoundTrips() throws {
        let json = #"{"followUp":null,"question":"Which branch?","settledAt":null,"startedAt":null,"state":"pending-input"}"#
        let job = try JSONDecoder().decode(CloudAgentJob.self, from: Data(json.utf8))
        #expect(job.state == .pendingInput)
        #expect(job == .pendingInput(question: "Which branch?", startedAt: nil, settledAt: nil, followUp: nil))
        let encoded = try JSONEncoder().encode(job)
        #expect(try JSONDecoder().decode(CloudAgentJob.self, from: encoded) == job)
    }
}
