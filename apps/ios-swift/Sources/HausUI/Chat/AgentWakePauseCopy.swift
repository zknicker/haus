import Foundation
import HausModels

/// What an Agent profile says about a paused Agent.
public struct AgentWakePausePresentation: Hashable, Sendable {
    public let title: String
    public let description: String

    public init(title: String, description: String) {
        self.title = title
        self.description = description
    }
}

/// Plain-language copy for an Agent the Server paused after repeated failed
/// turns, ported from the App's `agent-wake-pause-model.ts`. Raw error text
/// never reaches a client, so the last error is named from its stable code,
/// falling back to its kind, then to a generic sentence for values this build
/// does not know.
public enum AgentWakePauseCopy {
    public static func presentation(
        agentName: String,
        runtimeLabel: String?,
        wakePause: AgentWakePause,
        now: Date = Date()
    ) -> AgentWakePausePresentation {
        let lastError = failureSentence(
            code: wakePause.lastFailure.code,
            kind: wakePause.lastFailure.kind,
            runtime: runtimeLabel ?? "the runtime"
        )
        let sentences = [
            "\(agentName) failed \(failureCountPhrase(wakePause.failureCount)) in a row: \(lowerFirst(lastError))",
            // While the automatic retry runs, offering to retry would race it.
            wakePause.nextProbeAt == nil ? nil : "Send a message to try again now.",
            retryPhrase(nextProbeAt: wakePause.nextProbeAt, now: now),
        ]
        return AgentWakePausePresentation(
            title: "Paused after repeated failures",
            description: sentences.compactMap(\.self).joined(separator: " ")
        )
    }

    public static func failureSentence(code: String?, kind: String, runtime: String) -> String {
        if let code, let sentence = codeSentence(code, runtime: runtime) { return sentence }
        return kindSentence(kind, runtime: runtime)
    }

    public static func failureCountPhrase(_ count: Int) -> String {
        switch count {
        case 1: "once"
        case 2: "twice"
        default: "\(count) times"
        }
    }

    /// When the Server will retry on its own; no time means the retry is running.
    public static func retryPhrase(nextProbeAt: Date?, now: Date) -> String {
        guard let nextProbeAt else { return "Haus is trying again now…" }
        return "Haus will try once more automatically \(relativeFuture(nextProbeAt, now: now) ?? "any moment now")."
    }

    /// A future time as "in N units"; nil once it is due.
    static func relativeFuture(_ date: Date, now: Date) -> String? {
        let minutes = Int((date.timeIntervalSince(now) / 60).rounded())
        guard minutes >= 1 else { return nil }
        if minutes < 60 { return minutes == 1 ? "in a minute" : "in \(minutes) minutes" }
        let hours = Int((Double(minutes) / 60).rounded())
        if hours < 24 { return hours == 1 ? "in an hour" : "in \(hours) hours" }
        let days = Int((Double(hours) / 24).rounded())
        return days == 1 ? "in a day" : "in \(days) days"
    }

    private static func codeSentence(_ code: String, runtime: String) -> String? {
        switch code {
        case "authentication-required": "Couldn't sign in to \(runtime)."
        case "compaction-failed": "The conversation got too long to compact."
        case "configuration-invalid": "The Agent's runtime settings aren't valid."
        case "context-too-large": "The conversation got too long for the model."
        case "launch-failed": "The Agent couldn't launch."
        case "model-unavailable": "The model isn't available on this runtime."
        case "provider-error": "The provider kept erroring."
        case "provider-unavailable": "The provider was unreachable."
        case "rate-limited": "The provider kept hitting its rate limit."
        case "runner-credential-failed": "The Computer couldn't hand the Agent its credentials."
        case "runtime-not-installed": "The runtime isn't installed on this Computer."
        case "session-resume-rejected": "The Agent's session couldn't be resumed."
        case "start-rejected": "The runtime refused to start the run."
        case "turn-stalled": "The run stalled."
        default: nil
        }
    }

    private static func kindSentence(_ kind: String, runtime: String) -> String {
        switch kind {
        case "authentication": "Couldn't sign in to \(runtime)."
        case "configuration": "The Agent's runtime settings aren't valid."
        case "input": "The runtime couldn't accept the Agent's input."
        case "rate-limit": "The provider kept hitting its rate limit."
        case "session-resume": "The Agent's session couldn't be resumed."
        case "timeout": "The run stalled."
        case "transport": "The provider was unreachable."
        default: "Something went wrong running the Agent."
        }
    }

    private static func lowerFirst(_ sentence: String) -> String {
        sentence.prefix(1).lowercased() + sentence.dropFirst()
    }
}
