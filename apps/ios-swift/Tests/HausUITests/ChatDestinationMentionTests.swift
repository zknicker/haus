import Foundation
import Testing
@testable import HausUI

@Suite struct ChatDestinationMentionTests {
    private let agent = AgentPresentation(
        id: "agt_cove",
        name: "Cove",
        avatarURL: nil,
        presence: .idle
    )

    @Test func implicitAgentDestinationHasNoDurableChat() {
        let destination = ChatDestination.implicitAgentDM(agent)

        #expect(destination.id == .agentDM("agt_cove"))
        #expect(destination.durableChat == nil)
        #expect(destination.pendingKey == "agent-dm:agt_cove")
    }

    @Test func materializedAgentDestinationKeepsTheServerChatID() {
        let chat = ChatPresentation(
            id: "chat_1",
            title: "Cove",
            kind: .agentDirectMessage(agent)
        )
        let destination = ChatDestination.durableChat(chat)

        #expect(destination.id == .chat("chat_1"))
        #expect(destination.durableChat?.id == "chat_1")
    }

    @Test func materializedHumanDestinationKeepsDirectoryIdentityAndServerChatID() throws {
        let human = HumanPresentation(
            id: "usr_ada",
            name: "Ada Lovelace",
            handle: "ada",
            avatarURL: nil
        )
        let destination = ChatDestination.durableChat(ChatPresentation(
            id: "chat_human",
            title: human.name,
            kind: .humanDirectMessage(human)
        ))

        #expect(destination.id == .chat("chat_human"))
        let kind = try #require(destination.durableChat?.kind)
        guard case .humanDirectMessage(let peer) = kind else {
            Issue.record("Expected a materialized human DM")
            return
        }
        #expect(peer.id == "usr_ada")
        #expect(peer.handle == "ada")
    }

    @Test func mentionSelectionSerializesSharedMarkdownSyntax() throws {
        let text = "Ask @ad"
        let query = try #require(ComposerMentionQuery.active(in: text))
        let option = MentionOptionPresentation(
            id: "user://usr_ada",
            insertText: "@Ada Lovelace",
            label: "Ada Lovelace",
            detail: "Human · @ada",
            kind: .human,
            avatarURL: nil
        )

        #expect(query.inserting(option, into: text) == "Ask [@Ada Lovelace](user://usr_ada) ")
    }

    @Test func composerQueryReadsTheTriggerThatOpensTheWord() throws {
        let channelQuery = try #require(ComposerMentionQuery.active(in: "see #pro"))
        #expect(channelQuery.trigger == "#")
        #expect(channelQuery.value == "pro")

        let mentionQuery = try #require(ComposerMentionQuery.active(in: "see @ad"))
        #expect(mentionQuery.trigger == "@")
        #expect(mentionQuery.value == "ad")

        let skillQuery = try #require(ComposerMentionQuery.active(in: "use $agent"))
        #expect(skillQuery.trigger == "$")
        #expect(skillQuery.value == "agent")

        #expect(ComposerMentionQuery.active(in: "issue#3") == nil)
        #expect(ComposerMentionQuery.active(in: "cost$5") == nil)
    }

    @Test func channelSelectionSerializesSharedMarkdownSyntax() throws {
        let text = "Ask #pro"
        let query = try #require(ComposerMentionQuery.active(in: text))
        let option = MentionOptionPresentation(
            id: "chat://cht_product",
            insertText: "#product",
            label: "product",
            detail: "Channel",
            kind: .channel,
            avatarURL: nil,
            channelAppearance: ChannelAppearance(icon: "RocketIcon", color: "violet")
        )

        #expect(query.inserting(option, into: text) == "Ask [#product](chat://cht_product) ")
    }

    @Test func skillSelectionAddsTheSigilTheServerLeavesOffTheInsertText() throws {
        let text = "Use $agent"
        let query = try #require(ComposerMentionQuery.active(in: text))
        let option = MentionOptionPresentation(
            id: "skill://agent-browser",
            insertText: "agent-browser",
            label: "agent-browser",
            detail: "Browser automation CLI for AI agents.",
            kind: .skill,
            avatarURL: nil
        )

        #expect(
            query.inserting(option, into: text)
                == "Use [$agent-browser](skill://agent-browser) "
        )
    }

    @Test func richParserResolvesChannelReferencesByImmutableChatID() {
        let segments = RichMessageParser.parse("Ask in [#product](chat://cht_product).") { kind, id, _ in
            guard kind == .channel else { return nil }
            return RichReferencePresentation(
                id: id,
                kind: .channel,
                label: ReferenceLabel.display("product", kind: .channel),
                avatarURL: nil,
                channelAppearance: ChannelAppearance(icon: "RocketIcon", color: "violet")
            )
        }

        #expect(segments.contains(.reference(.init(
            id: "cht_product",
            kind: .channel,
            label: "Product",
            avatarURL: nil,
            channelAppearance: ChannelAppearance(icon: "RocketIcon", color: "violet")
        ))))
    }

    @Test func richParserReadsThePersistedLabelWithoutItsSigilForAnUnresolvedTarget() {
        let segments = RichMessageParser.parse(
            "Ask in [#onboarding-owner](chat://cht_gone) or ask [@Blippy](agent://agt_gone)."
        ) { _, _, _ in nil }

        #expect(segments.contains(.reference(.init(
            id: "cht_gone",
            kind: .channel,
            label: "Onboarding Owner",
            avatarURL: nil
        ))))
        #expect(segments.contains(.reference(.init(
            id: "agt_gone",
            kind: .agent,
            label: "Blippy",
            avatarURL: nil
        ))))
    }

    @Test func channelTitlesReadTheStoredSlugAsWords() {
        #expect(ReferenceLabel.channelTitle("onboarding-owner") == "Onboarding Owner")
        #expect(ReferenceLabel.channelTitle("product") == "Product")
        #expect(ReferenceLabel.channelTitle("Product") == "Product")
        #expect(ReferenceLabel.channelTitle("#GTM-notes") == "GTM Notes")
    }

    @Test func displayLabelsDropTheSigilAndTitleChannelsOnly() {
        #expect(ReferenceLabel.display("@Ada Lovelace", kind: .human) == "Ada Lovelace")
        #expect(ReferenceLabel.display("Blippy", kind: .agent) == "Blippy")
        #expect(ReferenceLabel.display("#onboarding-owner", kind: .channel) == "Onboarding Owner")
    }

    @Test func richParserResolvesAgentAndHumanReferencesByImmutableID() {
        let segments = RichMessageParser.parse(
            "Ask [@Cove](agent://agt_cove) and [@Ada](user://usr_ada)."
        ) { kind, id, _ in
            RichReferencePresentation(id: id, kind: kind, label: id, avatarURL: nil)
        }

        #expect(segments.contains(.reference(.init(id: "agt_cove", kind: .agent, label: "agt_cove", avatarURL: nil))))
        #expect(segments.contains(.reference(.init(id: "usr_ada", kind: .human, label: "usr_ada", avatarURL: nil))))
    }

    @Test func oneLinePreviewShowsReferenceLabelsInsteadOfTheirTargets() {
        let preview = RichMessageParser.oneLinePreview(
            "Ask [@Blippy](agent://agt_blippy) and [@Ada](user://usr_ada)\nabout the [#product](chat://cht_product) review"
        )

        #expect(preview == "Ask @Blippy and @Ada about the Product review")
    }

    @Test func oneLinePreviewKeepsTheMentionSigilTheWayTheAppDoes() {
        let preview = RichMessageParser.oneLinePreview("[@you](user://usr_viewer) Task +1")

        #expect(preview == "@you Task +1")
    }

    @Test func oneLinePreviewReadsASkillAsItsProductName() {
        let preview = RichMessageParser.oneLinePreview(
            "Run [$agent-browser](skill://agent-browser) on it"
        )

        #expect(preview == "Run Agent Browser on it")
    }

    @Test func oneLinePreviewCollapsesAWebLinkToItsText() {
        let preview = RichMessageParser.oneLinePreview(
            "See  [the release notes](https://haus.dev/releases) now"
        )

        #expect(preview == "See the release notes now")
    }
}

@Suite struct ParticipantHandleValidationTests {
    @Test(arguments: ["ada", "ada-2", "a1"])
    func acceptsSharedHandleGrammar(_ value: String) {
        #expect(ParticipantHandleValidation.error(for: value) == nil)
    }

    @Test func rejectsReservedAndMalformedHandles() {
        #expect(ParticipantHandleValidation.error(for: "haus") != nil)
        #expect(ParticipantHandleValidation.error(for: "Ada Lovelace") != nil)
        #expect(ParticipantHandleValidation.error(for: "a") != nil)
    }
}
