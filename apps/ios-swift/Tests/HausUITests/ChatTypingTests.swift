import Foundation
@testable import HausModels
@testable import HausUI
import Testing

@MainActor
struct ChatTypingTests {
    // MARK: - Words

    @Test func labelNamesUpToTwoThenCountsTheRest() {
        #expect(ChatTypingLabel.text([]) == nil)
        #expect(ChatTypingLabel.text(["Juniper"]) == "Juniper is typing")
        #expect(ChatTypingLabel.text(["Juniper", "Cove"]) == "Juniper and Cove are typing")
        #expect(ChatTypingLabel.text(["Juniper", "Cove", "Blippy"]) == "Juniper, Cove, and 1 other are typing")
        #expect(ChatTypingLabel.text(["Juniper", "Cove", "Blippy", "Tiny"]) == "Juniper, Cove, and 2 others are typing")
    }

    @Test func typistsAreEachAgentOnceAndSkipUnknownAgents() {
        let engagements = [
            engagement(agent: "agent_1", run: "run_1"),
            engagement(agent: "agent_ghost", run: "run_2"),
            engagement(agent: "agent_1", run: "run_3"),
            engagement(agent: "agent_2", run: "run_4"),
        ]
        let typists = ChatTypingLabel.typists(engagements) { id in
            id == "agent_ghost" ? nil : ChatTypist(id: id, name: id.uppercased(), avatarURL: nil)
        }
        #expect(typists.map(\.id) == ["agent_1", "agent_2"])
    }

    // MARK: - Model

    @Test func liveEventsPatchTheDurableRead() {
        let model = ChatTypingModel()
        model.replace([engagement(agent: "agent_1", run: "run_1")])
        model.apply(event(.started, agent: "agent_2", run: "run_2"))
        #expect(model.shownEngagements.map(\.runID) == ["run_1", "run_2"])

        model.apply(event(.ended(.settled), agent: "agent_1", run: "run_1"))
        #expect(model.shownEngagements.map(\.runID) == ["run_2"])

        model.replace([])
        #expect(model.shownEngagements.isEmpty)
    }

    @Test func aDoneReplyKeepsItsAgentUntilTheReplyIsInTheTranscript() {
        let model = ChatTypingModel()
        model.replace([engagement(agent: "agent_1", run: "run_1")])
        model.apply(event(.ended(.sent), agent: "agent_1", run: "run_1"))

        #expect(model.engagements.isEmpty)
        #expect(model.shownEngagements.map(\.agentID) == ["agent_1"])
    }

    @Test func aDoneReplyAlreadyInTheTranscriptLeavesAtOnce() {
        let model = ChatTypingModel()
        model.transcript = { [Self.reply(agent: "agent_1", run: "run_1")] }
        model.replace([engagement(agent: "agent_1", run: "run_1")])
        model.apply(event(.ended(.sent), agent: "agent_1", run: "run_1"))

        #expect(model.shownEngagements.isEmpty)
    }

    @Test func aThoughtShowsOnlyForTheRunEngagingThisChat() {
        let model = ChatTypingModel(clock: { 100 })
        model.replace([engagement(agent: "agent_1", run: "run_1")])

        model.receive(thought("Thinking about another chat", run: "run_9"))
        #expect(model.shownThought == nil)

        model.receive(thought("Checking the forecast", run: "run_1"))
        #expect(model.shownThought?.text == "Checking the forecast")
    }

    @Test func aThoughtGoesWhenItsRunStopsEngaging() {
        let model = ChatTypingModel(clock: { 100 })
        model.replace([engagement(agent: "agent_1", run: "run_1")])
        model.receive(thought("Checking the forecast", run: "run_1"))

        model.apply(event(.ended(.settled), agent: "agent_1", run: "run_1"))
        #expect(model.shownThought == nil)
        #expect(!model.canRecall)
    }

    @Test func theSameLineAgainKeepsItsIdentity() {
        let model = ChatTypingModel(clock: { 100 })
        model.replace([engagement(agent: "agent_1", run: "run_1")])
        model.receive(thought("Checking the forecast", run: "run_1"))
        let first = model.shownThought?.id

        model.receive(thought("checking the forecast.", run: "run_1"))
        #expect(model.shownThought?.id == first)
    }

    // MARK: - Motion

    @Test func theShimmerSweepsAcrossThenRestsOffTheEnd() {
        let period = ChatTypingShimmerText.period
        #expect(ChatTypingShimmerText.phase(at: 0) == 0)
        #expect(abs(ChatTypingShimmerText.phase(at: period * 0.4) - 0.5) < 0.001)
        #expect(ChatTypingShimmerText.phase(at: period * 0.9) == 1)
    }

    @Test func eachDotHopsInTurnAndRestsHalfThePeriod() {
        let period = ChatTypingDots.period
        #expect(abs(ChatTypingDots.lift(index: 0, at: period * 0.25) - 1) < 0.001)
        #expect(ChatTypingDots.lift(index: 0, at: period * 0.75) == 0)
        #expect(abs(ChatTypingDots.lift(index: 1, at: period * (0.25 + 1.0 / 6)) - 1) < 0.001)
    }

    // MARK: - Helpers

    private func engagement(agent: String, run: String) -> ChatEngagement {
        ChatEngagement(agentID: agent, chatID: "chat_1", runID: run, startedAt: Date())
    }

    private func event(_ kind: ChatEngagementEvent.Kind, agent: String, run: String) -> ChatEngagementEvent {
        ChatEngagementEvent(agentID: agent, chatID: "chat_1", emittedAt: Date(), runID: run, serverID: "server_1", kind: kind)
    }

    private func thought(_ text: String, run: String) -> AgentThoughtEvent {
        AgentThoughtEvent(agentID: "agent_1", at: Date(), chatID: "chat_1", runID: run, serverID: "server_1", text: text)
    }

    private static func reply(agent: String, run: String) -> ChatMessage {
        ChatMessage(
            attachments: [],
            author: .agent(agentID: agent, profile: nil),
            body: .text,
            cause: nil,
            chatID: "chat_1",
            content: "Here it is.",
            createdAt: Date(),
            id: "message_1",
            nonce: "nonce_1",
            reply: nil,
            runID: run,
            sequence: 1,
            serverID: "server_1",
            sessionGeneration: nil,
            task: nil
        )
    }
}
