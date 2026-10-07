import SwiftUI

/// What a stopped Agent's DM reads from the App. Installed once at the app
/// root; absent in previews.
public struct StoppedAgentSource: Sendable {
    /// The Agent's name while it is stopped, nil otherwise. Read inside the
    /// notice's body, so a Store-backed closure keeps the notice current.
    public let stoppedAgentName: @MainActor @Sendable (_ agentID: String) -> String?
    /// Whether the viewer may start Agents (Owners and Admins).
    public let canStart: @MainActor @Sendable () -> Bool
    public let start: @MainActor @Sendable (_ agentID: String) async throws -> Void

    public init(
        stoppedAgentName: @escaping @MainActor @Sendable (String) -> String?,
        canStart: @escaping @MainActor @Sendable () -> Bool,
        start: @escaping @MainActor @Sendable (String) async throws -> Void
    ) {
        self.stoppedAgentName = stoppedAgentName
        self.canStart = canStart
        self.start = start
    }
}

extension EnvironmentValues {
    @Entry public var stoppedAgentSource: StoppedAgentSource?
}

/// A stopped Agent's DM still takes messages, but they wait until someone
/// starts it. The App's `StoppedAgentDmNotice`: said once above the composer
/// in the footer's quiet register, with Start for the people who may run it.
struct StoppedAgentNotice: View {
    let name: String
    let canStart: Bool
    let onStart: () async throws -> Void

    @State private var isStarting = false
    @State private var failed = false
    @State private var started = 0
    @State private var failures = 0

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text(StoppedAgentNoticeCopy.message(name: name))
                    .foregroundStyle(.secondary)
                if failed {
                    Text(StoppedAgentNoticeCopy.failure(name: name))
                        .foregroundStyle(.red)
                        .transition(.opacity)
                }
            }
            .font(.footnote)
            .frame(maxWidth: .infinity, alignment: .leading)

            if canStart {
                Button(action: start) {
                    Text(isStarting ? "Starting…" : "Start")
                        .font(.footnote.weight(.semibold))
                }
                .buttonStyle(.bordered)
                .buttonBorderShape(.capsule)
                .controlSize(.small)
                .disabled(isStarting)
                .accessibilityLabel(isStarting ? "Starting \(name)" : "Start \(name)")
            }
        }
        .padding(.horizontal, 24)
        .padding(.vertical, 6)
        .animation(.easeOut(duration: 0.2), value: failed)
        .sensoryFeedback(.success, trigger: started)
        .sensoryFeedback(.error, trigger: failures)
        .accessibilityElement(children: .contain)
    }

    private func start() {
        guard !isStarting else { return }
        isStarting = true
        failed = false
        Task {
            do {
                try await onStart()
                started += 1
            } catch {
                failed = true
                failures += 1
            }
            isStarting = false
        }
    }
}

/// The notice's words, kept apart so they are testable.
enum StoppedAgentNoticeCopy {
    static func message(name: String) -> String {
        "\(name) is stopped and won’t see new messages until it’s started again."
    }

    static func failure(name: String) -> String {
        "Couldn’t start \(name). Try again."
    }
}
