import Foundation
import HausModels
import Testing
@testable import HausUI

@Suite("Cloud Agent sign-in")
struct CloudAgentSignInTests {
    @Test("decodes the waiting state and preserves its trusted remote link")
    func decodesWaitingState() throws {
        let capability = try decodeCapability(
            #"{"ready":false,"accountEmail":null,"reason":"not-connected","expiresAt":null,"provider":"cursor","signIn":{"status":"waiting","url":"https://cursor.com/loginDeepControl?uuid=test","expiresAt":"2026-09-22T18:00:00Z"}}"#
        )

        guard case .waiting(let url, let expiresAt) = capability.signIn else {
            Issue.record("Expected a waiting sign-in state")
            return
        }
        #expect(url.absoluteString == "https://cursor.com/loginDeepControl?uuid=test")
        #expect(expiresAt == HausISO8601.date(from: "2026-09-22T18:00:00Z"))
    }

    @Test("rejects a sign-in URL outside Cursor HTTPS")
    func rejectsUntrustedLink() {
        #expect(throws: DecodingError.self) {
            _ = try decodeCapability(
                #"{"ready":false,"accountEmail":null,"reason":"not-connected","expiresAt":null,"provider":"cursor","signIn":{"status":"waiting","url":"https://example.com/login","expiresAt":"2026-09-22T18:00:00Z"}}"#
            )
        }
    }

    @Test("decodes the Server's bounded retryable failure shape")
    func decodesFailureState() throws {
        let capability = try decodeCapability(
            #"{"ready":false,"accountEmail":null,"reason":"not-connected","expiresAt":null,"provider":"cursor","signIn":{"status":"failed","message":"This sign-in expired. Try again to get a new link."}}"#
        )

        guard case .failed(let message) = capability.signIn else {
            Issue.record("Expected a failed sign-in state")
            return
        }
        #expect(message == "This sign-in expired. Try again to get a new link.")
    }

    @Test("maps a ready capability to the connected presentation")
    func connectedPresentation() {
        let capability = CloudAgentCapability(
            ready: true,
            accountEmail: "delegate@example.com"
        )
        #expect(
            CloudAgentSignInModel.presentation(
                capability: capability,
                isOffline: false,
                isStarting: false
            ) == .connected(email: "delegate@example.com")
        )
    }

    @Test("maps waiting expiry to a retryable failure")
    func expiredPresentation() {
        let now = Date(timeIntervalSince1970: 100)
        let capability = CloudAgentCapability(
            ready: false,
            reason: "not-connected",
            signIn: .waiting(
                url: URL(string: "https://cursor.com/loginDeepControl?uuid=test")!,
                expiresAt: Date(timeIntervalSince1970: 99)
            )
        )

        #expect(
            CloudAgentSignInModel.presentation(
                capability: capability,
                isOffline: false,
                isStarting: false,
                now: now
            ) == .failed(message: "This sign-in expired. Try again to get a new link.")
        )
    }

    @Test("keeps a live waiting state actionable before expiry")
    func waitingPresentation() {
        let now = Date(timeIntervalSince1970: 100)
        let url = URL(string: "https://cursor.com/loginDeepControl?uuid=test")!
        let expiresAt = Date(timeIntervalSince1970: 101)
        let capability = CloudAgentCapability(
            ready: false,
            reason: "not-connected",
            signIn: .waiting(url: url, expiresAt: expiresAt)
        )

        #expect(
            CloudAgentSignInModel.presentation(
                capability: capability,
                isOffline: false,
                isStarting: false,
                now: now
            ) == .waiting(url: url, expiresAt: expiresAt)
        )
    }

    @Test("offline wins over a stale or waiting capability")
    func offlinePresentation() {
        let capability = CloudAgentCapability(
            ready: false,
            reason: "not-connected",
            signIn: .waiting(
                url: URL(string: "https://cursor.com/loginDeepControl?uuid=test")!,
                expiresAt: Date().addingTimeInterval(300)
            )
        )
        #expect(
            CloudAgentSignInModel.presentation(
                capability: capability,
                isOffline: true,
                isStarting: false
            ) == .offline
        )
    }

    @Test("uses the existing cancellation procedure name")
    func cancellationOperationName() {
        #expect(CloudAgentConnectionOperation.cancelSignIn.rawValue == "cancelSignIn")
    }

    @Test("cancelling the owner stops polling before a resumed owner starts")
    @MainActor
    func cancellationStopsPollingBeforeResume() async throws {
        let tracker = SignInFlowCallTracker()
        let waiting = CloudAgentCapability(
            ready: false,
            reason: "not-connected",
            signIn: .waiting(
                url: URL(string: "https://cursor.com/loginDeepControl?uuid=test")!,
                expiresAt: Date(timeIntervalSince1970: 4_000_000_000)
            )
        )
        let flow = CloudAgentSignInFlow(
            perform: { operation in
                await tracker.begin(operation)
                do {
                    try await Task.sleep(for: .milliseconds(1))
                    await tracker.end()
                    return waiting
                } catch {
                    await tracker.end()
                    throw error
                }
            },
            pollInterval: .milliseconds(20)
        )

        let firstOwner = Task {
            try? await flow.run(forceConnect: true, initialCapability: nil) { _ in }
        }
        try await tracker.waitForGetCount(1)
        firstOwner.cancel()
        _ = await firstOwner.value

        let stoppedCount = await tracker.snapshot().getCount
        try await Task.sleep(for: .milliseconds(40))
        let afterCancellation = await tracker.snapshot()
        #expect(afterCancellation.getCount == stoppedCount)

        let resumedOwner = Task {
            try? await flow.run(forceConnect: false, initialCapability: waiting) { _ in }
        }
        try await tracker.waitForGetCount(stoppedCount + 1)
        let resumed = await tracker.snapshot()
        #expect(resumed.maxActive == 1)
        resumedOwner.cancel()
        _ = await resumedOwner.value
    }

    private func decodeCapability(_ json: String) throws -> CloudAgentCapability {
        try HausJSON.decoder().decode(CloudAgentCapability.self, from: Data(json.utf8))
    }
}

private actor SignInFlowCallTracker {
    private var calls: [CloudAgentConnectionOperation] = []
    private var active = 0
    private var maxActive = 0

    func begin(_ operation: CloudAgentConnectionOperation) {
        calls.append(operation)
        active += 1
        maxActive = max(maxActive, active)
    }

    func end() {
        active -= 1
    }

    func snapshot() -> (getCount: Int, maxActive: Int) {
        (calls.count(where: { $0 == .get }), maxActive)
    }

    func waitForGetCount(_ expected: Int) async throws {
        for _ in 0..<1_000 {
            if calls.count(where: { $0 == .get }) >= expected { return }
            try await Task.sleep(for: .milliseconds(1))
        }
        throw SignInFlowTestTimeout()
    }
}

private struct SignInFlowTestTimeout: Error {}
