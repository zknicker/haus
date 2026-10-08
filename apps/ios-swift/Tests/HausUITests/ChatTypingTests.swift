import Foundation
@testable import HausModels
@testable import HausUI
import Testing

@MainActor
struct ChatTypingTests {
    // MARK: - Words

    @Test func labelNamesUpToTwoThenCountsTheRest() {
        #expect(ChatTypingLabel.text([]) == nil)
        #expect(ChatTypingLabel.text(["Juniper"]) == "Juniper is working")
        #expect(ChatTypingLabel.text(["Juniper", "Cove"]) == "Juniper and Cove are working")
        #expect(ChatTypingLabel.text(["Juniper", "Cove", "Blippy"]) == "Juniper, Cove, and 1 other are working")
        #expect(ChatTypingLabel.text(["Juniper", "Cove", "Blippy", "Tiny"]) == "Juniper, Cove, and 2 others are working")
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

    @Test func aHeldAgentKeepsItsPlaceInTheRow() {
        let model = ChatTypingModel()
        model.replace([engagement(agent: "agent_1", run: "run_1"), engagement(agent: "agent_2", run: "run_2")])
        model.apply(event(.ended(.sent), agent: "agent_1", run: "run_1"))

        #expect(model.shownEngagements.map(\.agentID) == ["agent_1", "agent_2"])
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
        #expect(model.bubble == nil)
        #expect(model.latestThought(for: "agent_1") == nil)

        model.receive(thought("Checking the forecast", run: "run_1"))
        #expect(model.bubble?.text == "Checking the forecast")
        #expect(model.latestThought(for: "agent_1")?.text == "Checking the forecast")
    }

    @Test func aSecondAgentsThoughtWaitsItsTurn() {
        let model = ChatTypingModel(clock: { 100 })
        model.replace([engagement(agent: "agent_1", run: "run_1"), engagement(agent: "agent_2", run: "run_2")])
        model.receive(thought("Checking the forecast", run: "run_1"))
        model.receive(thought("Reading the drawer code", agent: "agent_2", run: "run_2"))

        #expect(model.bubble?.agentID == "agent_1")
        // The waiting line is still the Agent's latest, for Working now.
        #expect(model.latestThought(for: "agent_2")?.text == "Reading the drawer code")
    }

    @Test func aThoughtGoesWhenItsRunStopsEngaging() {
        let model = ChatTypingModel(clock: { 100 })
        model.replace([engagement(agent: "agent_1", run: "run_1")])
        model.receive(thought("Checking the forecast", run: "run_1"))

        model.apply(event(.ended(.settled), agent: "agent_1", run: "run_1"))
        #expect(model.bubble == nil)
        #expect(model.latestThought(for: "agent_1") == nil)
    }

    @Test func aDoneReplyKeepsTheBubbleUpWhileItsAgentIsHeld() {
        let model = ChatTypingModel(clock: { 100 })
        model.replace([engagement(agent: "agent_1", run: "run_1")])
        model.receive(thought("Writing the answer", run: "run_1"))

        model.apply(event(.ended(.sent), agent: "agent_1", run: "run_1"))
        #expect(model.bubble?.text == "Writing the answer")
        #expect(model.latestThought(for: "agent_1")?.text == "Writing the answer")
    }

    @Test func theSameLineAgainKeepsItsIdentity() {
        let model = ChatTypingModel(clock: { 100 })
        model.replace([engagement(agent: "agent_1", run: "run_1")])
        model.receive(thought("Checking the forecast", run: "run_1"))
        let first = model.bubble?.id

        model.receive(thought("checking the forecast.", run: "run_1"))
        #expect(model.bubble?.id == first)
    }

    // MARK: - Motion and announcements

    @Test func theDotsHopInTurn() {
        let period = EngagementDots.period
        #expect(abs(EngagementDots.lift(index: 0, at: period * 0.25) - 1) < 0.001)
        #expect(EngagementDots.lift(index: 0, at: period * 0.75) == 0)
        #expect(abs(EngagementDots.lift(index: 1, at: period * (0.25 + 1.0 / 6)) - 1) < 0.001)
    }

    @Test func announcementsAreThrottled() {
        var now: TimeInterval = 0
        let announcer = EngagementAnnouncer(clock: { now })
        #expect(announcer.shouldAnnounce())
        now = EngagementAnnouncer.minimumInterval - 0.1
        #expect(!announcer.shouldAnnounce())
        now = EngagementAnnouncer.minimumInterval
        #expect(announcer.shouldAnnounce())
    }

    // MARK: - Helpers

    private func engagement(agent: String, run: String) -> ChatEngagement {
        ChatEngagement(agentID: agent, chatID: "chat_1", runID: run, startedAt: Date())
    }

    private func event(_ kind: ChatEngagementEvent.Kind, agent: String, run: String) -> ChatEngagementEvent {
        ChatEngagementEvent(agentID: agent, chatID: "chat_1", emittedAt: Date(), runID: run, serverID: "server_1", kind: kind)
    }

    private func thought(_ text: String, agent: String = "agent_1", run: String) -> AgentThoughtEvent {
        AgentThoughtEvent(agentID: agent, at: Date(), chatID: "chat_1", runID: run, serverID: "server_1", text: text)
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
