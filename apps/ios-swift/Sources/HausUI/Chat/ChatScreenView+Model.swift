import HausModels
import SwiftUI

/// The App's side of a Captain DM's model chip, carried on `ChatEngagementSource`: the Model
/// sheet's content, read from observed state, and the `agent.configure` write.
public struct CaptainModelSource: Sendable {
    /// Nil while the sheet cannot be built yet (model connections not loaded).
    public let presentation: @MainActor @Sendable (_ agentID: String) -> ModelSheetPresentation?
    /// Writes the Captain's model, which rotates its session. Throws the refusal.
    public let configure: @MainActor @Sendable (_ agentID: String, _ configuration: AgentRuntimeConfiguration) async throws -> Void

    public init(
        presentation: @escaping @MainActor @Sendable (String) -> ModelSheetPresentation?,
        configure: @escaping @MainActor @Sendable (String, AgentRuntimeConfiguration) async throws -> Void
    ) {
        self.presentation = presentation
        self.configure = configure
    }
}

/// The Server refused `agent.configure`; the reason is its message when it gave one. The chip turns
/// read-only for the rest of the screen's life.
public struct CaptainModelRefusal: Error, Sendable {
    public let reason: String?

    public init(reason: String?) {
        self.reason = reason
    }
}

/// A model change waiting on the person's confirmation, because it starts a fresh session.
struct PendingModelChange: Identifiable, Equatable {
    let agentID: String
    let captainName: String
    let configuration: AgentRuntimeConfiguration

    var id: AgentRuntimeConfiguration { configuration }
}

extension ChatScreenView {
    /// The model chip for a Captain DM: the Captain's model, read-only for Members or once the
    /// Server refused a change. A pick asks before it rotates the session.
    func composerModel(for kind: ChatKind) -> ComposerModelControl? {
        guard case .agentDirectMessage(let agent) = kind,
              let source = engagementSource?.captainModel,
              let presentation = source.presentation(agent.id)
        else { return nil }
        let shown = modelRefusal.map { reason in
            ModelSheetPresentation(
                captainName: presentation.captainName,
                current: presentation.current,
                groups: presentation.groups,
                access: .configureRefused(reason)
            )
        } ?? presentation
        return ComposerModelControl(presentation: shown) { configuration in
            pendingModelChange = PendingModelChange(
                agentID: agent.id,
                captainName: presentation.captainName,
                configuration: configuration
            )
        }
    }

    func applyModelChange(_ change: PendingModelChange) {
        guard let configure = engagementSource?.captainModel?.configure else { return }
        Task {
            do {
                try await configure(change.agentID, change.configuration)
            } catch let refusal as CaptainModelRefusal {
                modelRefusal = .some(refusal.reason)
            } catch is CancellationError {
                return
            } catch {
                modelChangeError = error.localizedDescription
            }
        }
    }
}

extension View {
    /// Asks before a model change, which starts the Captain on a fresh session.
    func modelChangeConfirmation(
        _ change: Binding<PendingModelChange?>,
        onConfirm: @escaping (PendingModelChange) -> Void
    ) -> some View {
        alert(
            "Change model?",
            isPresented: Binding(get: { change.wrappedValue != nil }, set: { if !$0 { change.wrappedValue = nil } }),
            presenting: change.wrappedValue
        ) { pending in
            Button("Change Model") { onConfirm(pending) }
            Button("Cancel", role: .cancel) {}
        } message: { pending in
            Text("\(pending.captainName) starts a fresh session on the new model, everywhere it works.")
        }
    }

    func modelChangeFailure(_ message: Binding<String?>) -> some View {
        alert(
            "Couldn’t Change Model",
            isPresented: Binding(get: { message.wrappedValue != nil }, set: { if !$0 { message.wrappedValue = nil } }),
            presenting: message.wrappedValue
        ) { _ in
            Button("OK", role: .cancel) {}
        } message: { text in
            Text(text)
        }
    }
}
