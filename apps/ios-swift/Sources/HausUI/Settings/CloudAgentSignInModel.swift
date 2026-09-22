import Foundation
import HausModels

/// The small presentation state owned by the sign-in sheet. It keeps network
/// and Computer details out of the view's branching and gives expiry a single
/// user-facing meaning across refreshes and retries.
public enum CloudAgentSignInPresentation: Equatable, Sendable {
    case starting
    case waiting(url: URL, expiresAt: Date)
    case connected(email: String?)
    case failed(message: String)
    case offline

    public var isWaiting: Bool {
        if case .waiting = self { return true }
        return false
    }
}

public enum CloudAgentSignInModel {
    public static func presentation(
        capability: CloudAgentCapability?,
        isOffline: Bool,
        isStarting: Bool,
        errorMessage: String? = nil,
        now: Date = Date()
    ) -> CloudAgentSignInPresentation {
        if isOffline {
            return .offline
        }
        if isStarting {
            return .starting
        }
        if let capability {
            if capability.ready {
                return .connected(email: capability.accountEmail)
            }
            if case .waiting(let url, let expiresAt) = capability.signIn,
               expiresAt > now
            {
                return .waiting(url: url, expiresAt: expiresAt)
            }
            if case .waiting(_, let expiresAt) = capability.signIn,
               expiresAt <= now
            {
                return .failed(message: "This sign-in expired. Try again to get a new link.")
            }
            if let signIn = capability.signIn, case .failed(let message) = signIn {
                return .failed(message: message)
            }
            if capability.reason == "provider-unavailable" {
                return .failed(message: "This Computer cannot reach Cursor’s Cloud Agents.")
            }
        }
        if let errorMessage, !errorMessage.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return .failed(message: errorMessage)
        }
        return .failed(message: "Sign-in did not finish. Try again to get a new link.")
    }
}

/// One lifecycle-owned sign-in run. The sheet starts this from `.task(id:)`,
/// so cancelling the task cancels the wait before another poll can be queued.
@MainActor
public struct CloudAgentSignInFlow {
    public typealias Performer = @MainActor (CloudAgentConnectionOperation) async throws -> CloudAgentCapability
    public typealias Update = @MainActor (CloudAgentCapability) -> Void

    private let perform: Performer
    private let pollInterval: Duration

    public init(
        perform: @escaping Performer,
        pollInterval: Duration = .seconds(2)
    ) {
        self.perform = perform
        self.pollInterval = pollInterval
    }

    public func run(
        forceConnect: Bool,
        initialCapability: CloudAgentCapability?,
        onUpdate: @escaping Update
    ) async throws {
        var state: CloudAgentCapability
        if forceConnect {
            if initialCapability?.signIn?.isExpired() == true {
                state = try await perform(.cancelSignIn)
                onUpdate(state)
            }
            state = try await perform(.connect)
        } else {
            state = try await perform(.get)
            if !state.ready, state.signIn == nil, state.reason != "provider-unavailable" {
                state = try await perform(.connect)
            }
        }
        onUpdate(state)

        while !Task.isCancelled,
              state.signIn?.isWaiting == true,
              state.signIn?.isExpired() != true,
              !state.ready
        {
            try await Task.sleep(for: pollInterval)
            try Task.checkCancellation()
            state = try await perform(.get)
            onUpdate(state)
        }
    }
}
