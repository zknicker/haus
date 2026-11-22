import HausModels
import SwiftUI

/// Stop on the Captain, as the App installs it once at its root: the phase the
/// Server's answers put each Captain in, and the stop itself. The DM header's
/// menu, the Captain profile, and a Home tile's long-press all read it.
public struct CaptainStopControl: Sendable {
    public let phase: @MainActor @Sendable (String) -> CaptainStopPhase?
    public let stop: @MainActor @Sendable (String) async throws -> Void

    public init(
        phase: @escaping @MainActor @Sendable (String) -> CaptainStopPhase?,
        stop: @escaping @MainActor @Sendable (String) async throws -> Void
    ) {
        self.phase = phase
        self.stop = stop
    }
}

extension EnvironmentValues {
    @Entry public var captainStop: CaptainStopControl?
}

/// What Stop reads in each phase. Only a running turn offers it; a pending
/// stop and a settled one read differently and do nothing.
enum CaptainStopCopy {
    static func title(_ phase: CaptainStopPhase) -> String {
        switch phase {
        case .available: "Stop"
        case .stopping: "Stopping…"
        case .stopped: "Stopped"
        }
    }

    static func systemImage(_ phase: CaptainStopPhase) -> String {
        switch phase {
        case .available: "stop.circle"
        case .stopping: "hourglass"
        case .stopped: "stop.circle.fill"
        }
    }

    static func isActionable(_ phase: CaptainStopPhase) -> Bool {
        phase == .available
    }

    static func confirmationTitle(name: String) -> String {
        "Stop \(name)?"
    }

    static func confirmationMessage(name: String) -> String {
        "\(name) ends the turn it is on and stays stopped until an Owner or Admin starts it again."
    }

    static func failureTitle(name: String) -> String {
        "Couldn't stop \(name)"
    }
}

/// The Captain a Stop confirmation is for.
struct CaptainStopTarget: Identifiable, Hashable {
    let id: String
    let name: String
}

extension View {
    /// Confirms a Stop before it reaches the Server, and says so when the
    /// Server refuses it.
    func captainStopConfirmation(_ target: Binding<CaptainStopTarget?>) -> some View {
        modifier(CaptainStopConfirmation(target: target))
    }
}

private struct CaptainStopConfirmation: ViewModifier {
    @Binding var target: CaptainStopTarget?
    @Environment(\.captainStop) private var control
    @State private var failure: CaptainStopFailure?

    func body(content: Content) -> some View {
        content
            .confirmationDialog(
                target.map { CaptainStopCopy.confirmationTitle(name: $0.name) } ?? "",
                isPresented: Binding(get: { target != nil }, set: { if !$0 { target = nil } }),
                titleVisibility: .visible,
                presenting: target
            ) { captain in
                Button("Stop", role: .destructive) { stop(captain) }
                Button("Cancel", role: .cancel) {}
            } message: { captain in
                Text(CaptainStopCopy.confirmationMessage(name: captain.name))
            }
            .alert(
                failure.map { CaptainStopCopy.failureTitle(name: $0.name) } ?? "",
                isPresented: Binding(get: { failure != nil }, set: { if !$0 { failure = nil } }),
                presenting: failure
            ) { _ in
                Button("OK", role: .cancel) {}
            } message: { failure in
                Text(failure.message)
            }
    }

    private func stop(_ captain: CaptainStopTarget) {
        guard let control else { return }
        Task {
            do {
                try await control.stop(captain.id)
            } catch {
                failure = CaptainStopFailure(name: captain.name, message: error.localizedDescription)
            }
        }
    }
}

private struct CaptainStopFailure: Hashable {
    let name: String
    let message: String
}
