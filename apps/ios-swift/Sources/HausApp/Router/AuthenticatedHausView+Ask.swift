import Foundation
import HausAppModel
import HausModels
import HausUI
import SwiftUI

/// The "Ask anything" card's state: the draft and its picks outlive the
/// sheet, so dismissing it or a refused start keeps what was typed. The
/// request id stays with the draft, so a retried start answers the same Task.
@MainActor
struct AskAnythingDraft {
    var text = ""
    var projectID: String?
    var computerID: String?
    var model: String?
    var requestID = UUID().uuidString.lowercased()
    var error: String?
    let interaction = ComposerInteraction()
}

extension AuthenticatedHausView {
    var askAnythingCard: some View {
        let projects = askProjects
        let projectID = AskAnythingPlan.choice(projects.map(\.id), picked: ask.projectID)
        let machines = askMachines
        let preferredMachine = projectID.flatMap { store.projects.project(chatID: $0)?.defaultMachine?.computerID }
        let computerID = AskAnythingPlan.choice(machines.map(\.id), picked: ask.computerID, preferred: preferredMachine)
        let models = askModels
        let model = AskAnythingPlan.choice(models.map(\.id), picked: ask.model)
        return AskAnythingCard(
            text: $ask.text,
            interaction: ask.interaction,
            project: AskAnythingPicker(choices: projects, selection: Binding(get: { projectID }, set: { ask.projectID = $0 })),
            machine: AskAnythingPicker(choices: machines, selection: Binding(get: { computerID }, set: { ask.computerID = $0 })),
            model: AskAnythingPicker(choices: models, selection: Binding(get: { model }, set: { ask.model = $0 })),
            error: ask.error,
            onSend: { text in await startAskedTask(text, projectID: projectID, computerID: computerID, model: model) }
        )
        .task { await loadAskChoices() }
    }

    var askProjects: [AskAnythingChoice] {
        store.chatDestinations.compactMap { destination in
            guard case .channel = destination.kind, let chat = destination.durableChat else { return nil }
            return AskAnythingChoice(id: chat.id, name: chat.title, appearance: chat.appearance)
        }
    }

    private var askMachines: [AskAnythingChoice] {
        (store.computers ?? []).map { AskAnythingChoice(id: $0.id, name: $0.name ?? "Device") }
    }

    /// The runner's models, one row per model id, in catalog order.
    private var askModels: [AskAnythingChoice] {
        var seen = Set<String>()
        return (store.modelConnections?.runtimeCatalog ?? [])
            .flatMap(\.models)
            .filter { seen.insert($0.id).inserted }
            .map { AskAnythingChoice(id: $0.id, name: $0.label) }
    }

    /// The Devices, model catalog, and Projects the pickers read, each once.
    private func loadAskChoices() async {
        guard let serverID = store.activeServer?.id else { return }
        if store.computers == nil || store.modelConnections == nil { await store.loadComputers(serverID: serverID) }
        if store.projects.projects == nil { await store.projects.load() }
    }

    /// `task.start`, then the new Task. A refusal keeps the draft and says why.
    private func startAskedTask(_ text: String, projectID: String?, computerID: String?, model: String?) async -> Bool {
        guard let serverID = store.activeServer?.id, let projectID, let model,
              let input = AskAnythingPlan.task(
                  text: text,
                  projectID: projectID,
                  model: model,
                  computerID: computerID,
                  requestID: ask.requestID,
                  serverID: serverID
              )
        else {
            ask.error = "Pick a project and a model first."
            return false
        }
        do {
            let task = try await store.tasks.start(input)
            ask.error = nil
            ask.requestID = UUID().uuidString.lowercased()
            router.open(.task(taskID: task.id), from: .outside)
            return true
        } catch {
            ask.error = error.localizedDescription
            return false
        }
    }
}
