import HausUI

extension AuthenticatedHausView {
    func openAgentCall(_ destination: ChatDestination) {
        guard let server = store.activeServer,
              let chat = destination.durableChat,
              case .agentDirectMessage(let agent) = destination.kind else { return }
        agentCall = AgentCallRequest(id: chat.id, serverID: server.id, chatID: chat.id, agentName: agent.name)
    }
}
