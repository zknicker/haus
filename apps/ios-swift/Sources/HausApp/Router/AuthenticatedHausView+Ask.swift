import HausAppModel
import HausModels
import HausUI
import SwiftUI

/// The "Ask anything" card's state: the draft and its picks outlive the
/// sheet, so dismissing it or a refused create keeps what was typed.
@MainActor
struct AskAnythingDraft {
    var text = ""
    var projectID: String?
    var captainID: String?
    var error: String?
    let interaction = ComposerInteraction()
}

extension AuthenticatedHausView {
    var askAnythingCard: some View {
        let projects = askProjects
        let captains = store.agents.map {
            AskAnythingChoice(id: $0.id, name: $0.displayName, avatarURL: store.resolvedAvatarURL($0.avatarURL))
        }
        let projectID = ask.projectID.flatMap { id in projects.contains { $0.id == id } ? id : nil } ?? projects.first?.id
        let captainID = AskAnythingPlan.captainID(
            captainIDs: captains.map(\.id),
            picked: ask.captainID,
            projectCaptainIDs: projectID.flatMap { store.chatsByID[$0]?.participantAgentIDs } ?? []
        )
        return AskAnythingCard(
            text: $ask.text,
            interaction: ask.interaction,
            projects: projects,
            captains: captains,
            projectID: Binding(get: { projectID }, set: { ask.projectID = $0 }),
            captainID: Binding(get: { captainID }, set: { ask.captainID = $0 }),
            error: ask.error,
            onSend: { text in await createAskedTask(text, projectID: projectID, captainID: captainID) }
        )
    }

    var askProjects: [AskAnythingChoice] {
        store.chatDestinations.compactMap { destination in
            guard case .channel = destination.kind, let chat = destination.durableChat else { return nil }
            return AskAnythingChoice(id: chat.id, name: chat.title, appearance: chat.appearance)
        }
    }

    /// `task.create`, then the new Task. A refusal keeps the draft and says why.
    private func createAskedTask(_ text: String, projectID: String?, captainID: String?) async -> Bool {
        guard let serverID = store.activeServer?.id, let projectID, let captainID,
              let input = AskAnythingPlan.task(text: text, projectID: projectID, captainID: captainID, serverID: serverID)
        else {
            ask.error = "Pick a project and a Captain first."
            return false
        }
        do {
            let created = try await store.client.call(TaskProcedures.create, input)
            ask.error = nil
            router.open(.task(taskID: created.task.id), from: .outside)
            return true
        } catch {
            ask.error = error.localizedDescription
            return false
        }
    }
}
