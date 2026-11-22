import Foundation
import HausModels

/// The follow-up composer's one trailing button: Send, or Stop Worker while a
/// turn runs and the field is empty. Mirrors the App's
/// `worker-follow-up-controls.ts`.
public struct WorkerFollowUpControls: Equatable, Sendable {
    public enum Mode: Equatable, Sendable { case send, sending, stop }

    public let mode: Mode
    public let label: String
    public let isDisabled: Bool

    public var stops: Bool { mode == .stop }

    /// - Parameters:
    ///   - canStop: a turn is live, nobody has asked it to stop, and no stop is in flight.
    ///   - stopHeld: a follow-up just went in for this live turn, so the cleared
    ///     field stays Send until the person types.
    public init(canStop: Bool, draft: String, sending: Bool, stopHeld: Bool) {
        let isEmpty = draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        let stops = isEmpty && canStop && !sending && !stopHeld
        mode = sending ? .sending : stops ? .stop : .send
        label = stops ? "Stop Worker" : "Send follow-up"
        isDisabled = sending || (isEmpty && !stops)
    }

    /// The field's placeholder: a live turn takes follow-ups for afterward.
    public static func placeholder(status: WorkerStatus, live: Bool) -> String {
        if live { return "Goes in when this turn ends" }
        return status == .needsYou ? "Answer this Worker" : "Follow up"
    }
}

/// The Worker's live turn as the composer reads it.
public struct WorkerLiveTurn: Equatable, Sendable {
    public let turnId: String
    public let stopRequested: Bool

    /// The newest turn while it runs or waits to.
    public init?(worker: Worker) {
        guard let newest = worker.runs.first, newest.status.isActive, newest.terminalAt == nil else { return nil }
        turnId = newest.runId
        stopRequested = newest.stopRequestedAt != nil
    }
}
