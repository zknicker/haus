import HausModels
import HausUI

extension HausStore {
    /// How fast the sidebar's Haus mark drifts. Reads the one bit the activity
    /// snapshot leaves behind rather than the snapshot itself, so the shell is
    /// not invalidated by every semantic activity event.
    var agentActivityGhostTempo: HausGhostTempo {
        HausGhostTempo.resolve(
            isSnapshotReady: hasAgentActivitySnapshot,
            hasWorkingAgent: isAnyAgentWorking
        )
    }

    /// Resolved where it is drawn — inside the Chat details sheet — rather than
    /// at the shell's root. `agent.onActivity` ticks constantly, and reading
    /// this projection at the root invalidated the whole shell once per frame.
    func currentActivityPresentation(agentID: String) -> AgentActivityPresentation? {
        guard let event = currentActivityByAgentID[agentID],
              agentsByID[agentID].map({ availability(for: $0) == .working }) == true
        else { return nil }
        return activityPresentation(event, active: true)
    }

    func agentActivityPresentations(agentID: String) async throws -> [AgentActivityPresentation] {
        try await loadAgentActivityHistory(agentID: agentID)
            .filter { $0.phase != .started }
            .prefix(16)
            .map { activityPresentation($0, active: false) }
    }

    private func activityPresentation(
        _ event: AgentActivityEvent,
        active: Bool
    ) -> AgentActivityPresentation {
        let state: AgentActivityState = active
            ? .active
            : event.phase == .failed ? .failed : .completed
        return AgentActivityPresentation(
            id: event.id,
            title: active ? event.category.activeTitle : event.category.completedTitle,
            occurredAt: event.occurredAt,
            state: state
        )
    }
}

private extension AgentActivityCategory {
    var activeTitle: String {
        switch self {
        case .startingWork: "Starting work…"
        case .checkingMessages: "Checking messages…"
        case .thinking: "Thinking…"
        case .browsing: "Browsing…"
        case .searchingWeb: "Searching the web…"
        case .readingFiles: "Reading files…"
        case .editingFiles: "Editing files…"
        case .runningCommand: "Running a command…"
        case .usingTool: "Using a tool…"
        case .sendingMessage: "Finishing up…"
        case .working: "Working…"
        }
    }

    var completedTitle: String {
        switch self {
        case .startingWork: "Started work"
        case .checkingMessages: "Checked messages"
        case .thinking: "Finished thinking"
        case .browsing: "Finished browsing"
        case .searchingWeb: "Searched the web"
        case .readingFiles: "Read files"
        case .editingFiles: "Edited files"
        case .runningCommand: "Ran a command"
        case .usingTool: "Used a tool"
        case .sendingMessage: "Sent a message"
        case .working: "Finished work"
        }
    }
}
