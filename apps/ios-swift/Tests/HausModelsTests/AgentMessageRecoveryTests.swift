import Foundation
import HausModels
import Testing

@Suite("Agent message recovery")
struct AgentMessageRecoveryTests {
    @Test("Only an active sending lifecycle advances mounted Chat recovery")
    func plansMountedPagesAndSearchOnce() {
        var state = AgentMessageRecoveryState()
        let oldRead = state.beginRead(serverID: "srv_main", chatID: "thread_1")

        let working = lifecycle(phase: .working)
        #expect(
            state.beginRecovery(
                event: working,
                activeServerID: "srv_main",
                mountedChatIDs: ["thread_1", "chat_parent"]
            ) == nil
        )
        #expect(state.accepts(oldRead, activeServerID: "srv_main"))
        #expect(state.searchRevision == 0)

        #expect(
            state.beginRecovery(
                event: lifecycle(phase: .sending, serverID: "srv_other"),
                activeServerID: "srv_main",
                mountedChatIDs: ["thread_1"]
            ) == nil
        )
        #expect(state.accepts(oldRead, activeServerID: "srv_main"))

        let plan = state.beginRecovery(
            event: lifecycle(phase: .sending),
            activeServerID: "srv_main",
            mountedChatIDs: ["thread_1", "chat_parent", "thread_1"]
        )
        #expect(plan?.serverID == "srv_main")
        #expect(plan?.chatIDs == ["thread_1", "chat_parent"])
        #expect(plan?.searchRevision == 1)
        #expect(!state.accepts(oldRead, activeServerID: "srv_main"))

        let recoveredRead = state.beginRead(serverID: "srv_main", chatID: "thread_1")
        #expect(state.accepts(recoveredRead, activeServerID: "srv_main"))

        // A response begun after recovery remains valid even when another
        // pagination read starts before it returns. The page merge, rather
        // than a global latest-request gate, preserves both reads.
        let recoveryPage = state.beginRead(serverID: "srv_main", chatID: "thread_1")
        let olderPage = state.beginRead(serverID: "srv_main", chatID: "thread_1")
        #expect(state.accepts(recoveryPage, activeServerID: "srv_main"))
        #expect(state.accepts(olderPage, activeServerID: "srv_main"))
        #expect(state.searchRevision == 1)
    }

    @Test("A response from another Server or an older recovery session cannot apply")
    func scopesAndOrdersResponses() {
        var state = AgentMessageRecoveryState()
        let wrongServer = state.beginRead(serverID: "srv_other", chatID: "chat_1")
        #expect(!state.accepts(wrongServer, activeServerID: "srv_main"))

        let first = state.beginRead(serverID: "srv_main", chatID: "chat_1")
        let second = state.beginRead(serverID: "srv_main", chatID: "chat_1")
        // Pagination and a snapshot can overlap in one generation; their
        // existing merge rules remain intact until recovery advances it.
        #expect(state.accepts(first, activeServerID: "srv_main"))
        #expect(state.accepts(second, activeServerID: "srv_main"))

        state.beginSession()
        #expect(!state.accepts(second, activeServerID: "srv_main"))
        let current = state.beginRead(serverID: "srv_main", chatID: "chat_1")
        #expect(state.accepts(current, activeServerID: "srv_main"))
    }

    private func lifecycle(
        phase: AgentLifecyclePhase,
        serverID: String = "srv_main"
    ) -> AgentLifecycleEvent {
        AgentLifecycleEvent(
            agentID: "agent_1",
            chatID: "thread_1",
            emittedAt: Date(timeIntervalSince1970: 1),
            runID: "run_1",
            serverID: serverID,
            phase: phase,
            compositionID: phase == .sending ? "composition_1" : nil,
            text: phase == .sending ? "Committed reply" : nil
        )
    }
}
