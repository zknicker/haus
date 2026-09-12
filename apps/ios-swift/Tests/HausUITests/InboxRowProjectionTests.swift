import Foundation
import HausModels
@testable import HausUI
import Testing

/// The Inbox's two-record sections: what each row says, and in what order.
struct InboxNeedsYouRowsTests {
    @Test func leadsWithAsksAndNamesWhereEachCameFrom() throws {
        let rows = try #require(InboxNeedsYouRows.rows(
            asks: [InboxFixtures.openAsk()],
            tasks: [
                InboxFixtures.task(number: 3, origin: .claimed, status: .inProgress, tier: .tracked)
            ],
            resolveActor: InboxFixtures.directory
        ))

        #expect(rows.map(\.title) == ["Pick a rollout window", "Blippy stopped before finishing"])
        #expect(rows.map(\.meta) == ["Ask · #onboarding", "#all · Task #3"])
        #expect(rows.map(\.id) == ["ask:message_ask", "claim:message_task_3"])
    }

    @Test func opensAnAskAtItsMessageAndAStalledClaimAtTheTaskList() throws {
        let rows = try #require(InboxNeedsYouRows.rows(
            asks: [InboxFixtures.openAsk()],
            tasks: [
                InboxFixtures.task(number: 3, origin: .claimed, status: .inProgress, tier: .tracked)
            ],
            resolveActor: InboxFixtures.directory
        ))

        #expect(rows[0].open == .ask(messageID: "message_ask"))
        #expect(rows[1].open == .tasks)
    }

    @Test func listsOnlyClaimsThatStalled() throws {
        let rows = try #require(InboxNeedsYouRows.rows(
            asks: [],
            tasks: [
                InboxFixtures.task(number: 1, origin: .claimed, status: .inProgress, tier: .tracked, live: true),
                InboxFixtures.task(number: 2, origin: .composed, status: .inProgress, tier: .tracked),
                InboxFixtures.task(number: 3, origin: .claimed, status: .inReview, tier: .tracked),
                InboxFixtures.task(number: 4, origin: .claimed, status: .inProgress, tier: .background),
                InboxFixtures.task(number: 5, origin: .claimed, status: .inProgress, tier: .tracked),
            ],
            resolveActor: InboxFixtures.directory
        ))

        #expect(rows.map(\.meta) == ["#all · Task #5"])
    }

    @Test func flattensAnAskSummaryToOneLine() throws {
        let rows = try #require(InboxNeedsYouRows.rows(
            asks: [InboxFixtures.openAsk(summary: "Ship on\n**Friday** or Monday")],
            tasks: [],
            resolveActor: InboxFixtures.directory
        ))

        #expect(rows[0].preview == "Ship on **Friday** or Monday")
    }

    @Test func namesADirectMessageAsDM() throws {
        let rows = try #require(InboxNeedsYouRows.rows(
            asks: [InboxFixtures.openAsk(chatKind: .dm, chatName: nil)],
            tasks: [],
            resolveActor: InboxFixtures.directory
        ))

        #expect(rows[0].meta == "Ask · DM")
    }

    /// Both reads make the same claim, so a half-loaded section says nothing.
    @Test func staysNeutralUntilBothReadsHaveLanded() {
        #expect(
            InboxNeedsYouRows.rows(asks: nil, tasks: [], resolveActor: InboxFixtures.directory) == nil
        )
        #expect(
            InboxNeedsYouRows.rows(asks: [], tasks: nil, resolveActor: InboxFixtures.directory) == nil
        )
        #expect(
            InboxNeedsYouRows.rows(asks: [], tasks: [], resolveActor: InboxFixtures.directory) == []
        )
    }

    @Test func fallsBackToTheStoredAuthorProfileForARetiredAgent() throws {
        let rows = try #require(InboxNeedsYouRows.rows(
            asks: [InboxFixtures.openAsk()],
            tasks: [],
            resolveActor: { _, _ in nil }
        ))

        #expect(rows[0].mark == .identity(name: "Blippy", avatarURL: nil, presence: nil))
    }
}

struct InboxHappeningNowRowsTests {
    private let now = Date(timeIntervalSince1970: 1_800_000_000)

    @Test func leadsWithCloudAgentWorkAndStatesElapsedTime() throws {
        let rows = try #require(InboxHappeningNowRows.rows(
            work: [InboxFixtures.activeWork(startedAt: Date(timeIntervalSince1970: 1_799_998_500))],
            agents: [
                InboxWorkingAgent(
                    id: "agent_blippy",
                    name: "Blippy",
                    avatarURL: nil,
                    presence: .working,
                    step: "Editing files…",
                    occurredAt: Date(timeIntervalSince1970: 1_799_999_820)
                )
            ],
            now: now,
            resolveActor: InboxFixtures.directory
        ))

        #expect(rows.map(\.id) == ["work:message_work", "agent:agent_blippy"])
        #expect(rows[0].meta == "Running · 25m")
        #expect(rows[0].preview == "#all · Blippy")
        #expect(rows[1].preview == "Editing files · 3m")
        #expect(rows[1].meta == nil)
    }

    @Test func opensWorkAtItsMessageAndAnAgentAtItsChat() throws {
        let rows = try #require(InboxHappeningNowRows.rows(
            work: [InboxFixtures.activeWork(startedAt: now)],
            agents: [
                InboxWorkingAgent(
                    id: "agent_blippy",
                    name: "Blippy",
                    avatarURL: nil,
                    presence: .working,
                    step: "Thinking…",
                    occurredAt: now
                )
            ],
            now: now,
            resolveActor: InboxFixtures.directory
        ))

        #expect(rows[0].open == .cloudAgentWork(messageID: "message_work"))
        #expect(rows[1].open == .agent("agent_blippy"))
    }

    @Test func staysNeutralUntilTheWorkReadHasLanded() {
        #expect(
            InboxHappeningNowRows.rows(
                work: nil,
                agents: [],
                now: now,
                resolveActor: InboxFixtures.directory
            ) == nil
        )
        #expect(
            InboxHappeningNowRows.rows(
                work: [],
                agents: [],
                now: now,
                resolveActor: InboxFixtures.directory
            ) == []
        )
    }

    @Test func formatsElapsedTimeTheWayEveryOtherHausSurfaceDoes() {
        #expect(InboxElapsed.duration(seconds: 0) == "0s")
        #expect(InboxElapsed.duration(seconds: 59) == "59s")
        #expect(InboxElapsed.duration(seconds: 60) == "1m")
        #expect(InboxElapsed.duration(seconds: 3_599) == "59m")
        #expect(InboxElapsed.duration(seconds: 7_200) == "2h")
        #expect(InboxElapsed.duration(seconds: 7_500) == "2h 5m")
    }
}

struct InboxActiveAgentsTests {
    @Test func ranksWorkingAgentsFirstThenTheBusiestWeekThenTheName() {
        let ranked = InboxActiveAgents.rank([
            InboxFixtures.week(id: "quiet", name: "Quiet", tokens: 0),
            InboxFixtures.week(id: "busy", name: "Busy", tokens: 900),
            InboxFixtures.week(id: "live", name: "Live", tokens: 5, activity: "Thinking…"),
            InboxFixtures.week(id: "tied", name: "Alpha", tokens: 900),
        ])

        #expect(ranked.map(\.id) == ["live", "tied", "busy"])
    }

    @Test func capsTheStripAtEightCards() {
        let ranked = InboxActiveAgents.rank(
            (0..<12).map { InboxFixtures.week(id: "a\($0)", name: "A\($0)", tokens: 100 - $0) }
        )

        #expect(ranked.count == InboxActiveAgents.limit)
    }

    @Test func statesWhatTheFigureCountsUnlessTheAgentIsMidTurn() {
        #expect(InboxFixtures.week(id: "a", name: "A", tokens: 3).unit == "Tokens · 7d")
        #expect(
            InboxFixtures.week(id: "b", name: "B", tokens: 3, activity: "Editing files…").unit
                == "Editing files…"
        )
    }
}
