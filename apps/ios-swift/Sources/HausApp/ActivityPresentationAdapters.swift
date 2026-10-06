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
        let state: AgentActivityState = if active {
            .active
        } else {
            switch event.phase {
            case .failed, .interrupted: .failed
            case .started, .completed: .completed
            }
        }
        let title = if active {
            event.category.activeTitle
        } else if event.phase == .interrupted {
            event.category.interruptedTitle
        } else {
            event.category.completedTitle
        }
        return AgentActivityPresentation(
            id: event.id,
            title: title,
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
        case .receivedMessage: "Received a new message…"
        case .thinking: "Thinking…"
        case .updatingInstructions: "Updating instructions…"
        case .browsing: "Browsing…"
        case .searchingWeb: "Searching the web…"
        case .readingFiles: "Reading files…"
        case .editingFiles: "Editing files…"
        case .runningCommand: "Running a command…"
        case .usingTool: "Using a tool…"
        case .delegating: "Running a sub-agent…"
        case .sendingMessage: "Finishing up…"
        case .working, .unknown: "Working…"
        }
    }

    var completedTitle: String {
        switch self {
        case .startingWork: "Started work"
        case .checkingMessages: "Checked messages"
        case .receivedMessage: "Received a new message"
        case .thinking: "Finished thinking"
        case .updatingInstructions: "Updated instructions"
        case .browsing: "Finished browsing"
        case .searchingWeb: "Searched the web"
        case .readingFiles: "Read files"
        case .editingFiles: "Edited files"
        case .runningCommand: "Ran a command"
        case .usingTool: "Used a tool"
        case .delegating: "Ran a sub-agent"
        case .sendingMessage: "Sent a message"
        case .working, .unknown: "Finished work"
        }
    }

    var interruptedTitle: String {
        switch self {
        case .startingWork: "Starting work was interrupted"
        case .checkingMessages: "Message check was interrupted"
        case .receivedMessage: "Receiving a new message was interrupted"
        case .thinking: "Thinking was interrupted"
        case .updatingInstructions: "Instruction update was interrupted"
        case .browsing: "Browsing was interrupted"
        case .searchingWeb: "Web search was interrupted"
        case .readingFiles: "File reading was interrupted"
        case .editingFiles: "File editing was interrupted"
        case .runningCommand: "Command was interrupted"
        case .usingTool: "Tool use was interrupted"
        case .delegating: "Sub-agent was interrupted"
        case .sendingMessage: "Message send was interrupted"
        case .working, .unknown: "Work was interrupted"
        }
    }
}
