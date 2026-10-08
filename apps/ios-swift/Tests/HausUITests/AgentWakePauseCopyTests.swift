import Foundation
import HausModels
@testable import HausUI
import Testing

/// The App's `agent-wake-pause-model.ts` copy, on the phone's Agent profile.
struct AgentWakePauseCopyTests {
    private let now = Date(timeIntervalSince1970: 1_000_000)

    @Test func namesTheFailureByCodeAndSaysWhenHausRetries() {
        let copy = AgentWakePauseCopy.presentation(
            agentName: "Cove",
            runtimeLabel: "Claude Code",
            wakePause: pause(count: 3, code: "rate-limited", kind: "rate-limit", nextProbeIn: 12 * 60)
        )
        #expect(copy.title == "Paused after repeated failures")
        #expect(copy.description == "Cove failed 3 times in a row: the provider kept hitting its rate limit. Send a message to try again now. Haus will try once more automatically in 12 minutes.")
    }

    @Test func fallsBackToTheKindAndNamesTheRuntime() {
        let copy = AgentWakePauseCopy.presentation(
            agentName: "Cove",
            runtimeLabel: "Codex",
            wakePause: pause(count: 2, code: nil, kind: "authentication", nextProbeIn: 90 * 60)
        )
        #expect(copy.description.hasPrefix("Cove failed twice in a row: couldn't sign in to Codex."))
        #expect(copy.description.hasSuffix("in 2 hours."))
    }

    @Test func aRetryInFlightOffersNoSecondRetry() {
        let copy = AgentWakePauseCopy.presentation(
            agentName: "Cove",
            runtimeLabel: nil,
            wakePause: pause(count: 1, code: "brand-new-code", kind: "brand-new-kind", nextProbeIn: nil)
        )
        #expect(copy.description == "Cove failed once in a row: something went wrong running the Agent. Haus is trying again now…")
    }

    @Test func aDueRetrySaysAnyMomentNow() {
        #expect(AgentWakePauseCopy.retryPhrase(nextProbeAt: now.addingTimeInterval(10), now: now)
            == "Haus will try once more automatically any moment now.")
        #expect(AgentWakePauseCopy.relativeFuture(now.addingTimeInterval(36 * 3600), now: now) == "in 2 days")
    }

    private func pause(count: Int, code: String?, kind: String, nextProbeIn: TimeInterval?) -> AgentWakePause {
        AgentWakePause(
            failureCount: count,
            lastFailure: .init(at: now, code: code, kind: kind),
            nextProbeAt: nextProbeIn.map { Date().addingTimeInterval($0) },
            pausedAt: now
        )
    }
}
