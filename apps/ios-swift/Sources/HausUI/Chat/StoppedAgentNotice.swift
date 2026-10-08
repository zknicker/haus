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
/// starts it. The App's `StoppedAgentDmNotice`, drawn the way iOS draws a
/// standing fact about a conversation: one glass card above the composer with
/// a status glyph, a short title and its consequence, and Start for the
/// people who may run it. A failed start is an alert, not red text.
struct StoppedAgentNotice: View {
    let name: String
    let canStart: Bool
    let onStart: () async throws -> Void

    @State private var isStarting = false
    @State private var isShowingFailure = false
    @State private var started = 0

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: "stop.circle.fill")
                .font(.title2)
                .foregroundStyle(.secondary)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 1) {
                Text(StoppedAgentNoticeCopy.title(name: name))
                    .font(.subheadline.weight(.semibold))
                Text(StoppedAgentNoticeCopy.detail)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .accessibilityElement(children: .combine)

            if canStart {
                Button(action: start) {
                    ZStack {
                        // The label keeps its width while the spinner stands in.
                        Text("Start").opacity(isStarting ? 0 : 1)
                        if isStarting { ProgressView().controlSize(.small) }
                    }
                    .font(.subheadline.weight(.semibold))
                }
                .buttonStyle(.borderedProminent)
                .buttonBorderShape(.capsule)
                .controlSize(.small)
                .disabled(isStarting)
                .accessibilityLabel(isStarting ? "Starting \(name)" : "Start \(name)")
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .modifier(StoppedAgentNoticeSurface())
        .padding(.horizontal, 12)
        .padding(.bottom, 6)
        .sensoryFeedback(.success, trigger: started)
        .sensoryFeedback(.error, trigger: isShowingFailure) { _, failed in failed }
        .alert(StoppedAgentNoticeCopy.failureTitle(name: name), isPresented: $isShowingFailure) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(StoppedAgentNoticeCopy.failureDetail)
        }
        .accessibilityElement(children: .contain)
    }

    private func start() {
        guard !isStarting else { return }
        isStarting = true
        Task {
            do {
                try await onStart()
                started += 1
            } catch {
                isShowingFailure = true
            }
            isStarting = false
        }
    }
}

/// The same glass the composer floats on, so the notice reads as part of the
/// composer's chrome rather than text laid over the transcript.
private struct StoppedAgentNoticeSurface: ViewModifier {
    func body(content: Content) -> some View {
        if #available(iOS 26, macOS 26, *) {
            content.glassEffect(.regular, in: .haus(HausRadius.large))
        } else {
            content.background(.thinMaterial, in: .haus(HausRadius.large))
        }
    }
}

/// The notice's words, kept apart so they are testable.
enum StoppedAgentNoticeCopy {
    static func title(name: String) -> String {
        "\(name) is stopped"
    }

    static let detail = "It won’t see new messages until it’s started again."

    static func failureTitle(name: String) -> String {
        "Couldn’t Start \(name)"
    }

    static let failureDetail = "Try again in a moment."
}
