import Foundation
import HausAppModel
import HausModels
import HausUI

/// The models' state under the names the views and older extensions read.
/// New call sites read the model directly.
extension HausStore {
    var activeServer: ServerSummary? {
        guard let serverID = scope.serverID else { return nil }
        return servers.first { $0.id == serverID }
    }

    var realtimeReconciliation: RealtimeReconciliation {
        get { scope.reconciliation }
        set { scope.reconciliation = newValue }
    }

    var drafts: ComposerDraftStore<ComposerInteraction> { lifecycle.drafts }

    // MARK: - Chats

    var chats: [ChatSummary] {
        get { chatList.chats }
        set { chatList.chats = newValue }
    }

    var hasLoadedChats: Bool { chatList.hasLoadedChats }

    var receiptBackedAgentDMsByChatID: [String: String] {
        get { chatList.receiptBackedAgentDMsByChatID }
        set { chatList.receiptBackedAgentDMsByChatID = newValue }
    }

    var markedReadThrough: [String: Int] {
        get { chatList.markedReadThrough }
        set { chatList.markedReadThrough = newValue }
    }

    // MARK: - Captains

    var agents: [AgentSummary] {
        get { captains.agents }
        set { captains.agents = newValue }
    }

    var lifecycleAvailability: [String: AgentAvailability] {
        get { captains.lifecycleAvailability }
        set { captains.lifecycleAvailability = newValue }
    }

    var currentActivityByAgentID: [String: AgentActivityEvent] { captains.currentActivityByAgentID }
    var lifecycleRevision: Int { captains.lifecycleRevision }

    // MARK: - Settings

    var computers: [ComputerSummary]? { settingsModel.computers }
    var modelConnections: ModelConnectionsRead? { settingsModel.modelConnections }

    func loadComputers(serverID: String) async {
        await settingsModel.load(serverID: serverID)
    }
}
