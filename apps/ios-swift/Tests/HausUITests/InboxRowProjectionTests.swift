import Foundation
import HausModels
@testable import HausUI
import Testing

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
        #expect(rows[0].status == "Running · 25m")
        #expect(rows[0].detail == "#all · Blippy")
        #expect(rows[0].title == "Ship the iPhone build")
        #expect(rows[1].title == "Blippy")
        #expect(rows[1].status == "3m")
        #expect(rows[1].detail == "Editing files…")
    }

    @Test func untitledWorkAndStepFallBackToPlainLabels() throws {
        let rows = try #require(InboxHappeningNowRows.rows(
            work: [InboxFixtures.activeWork(startedAt: now, title: "  ")],
            agents: [
                InboxWorkingAgent(
                    id: "agent_blippy",
                    name: "Blippy",
                    avatarURL: nil,
                    presence: .working,
                    step: "",
                    occurredAt: now
                )
            ],
            now: now,
            resolveActor: InboxFixtures.directory
        ))

        #expect(rows[0].title == "Cloud work")
        #expect(rows[0].detail == "#all · Blippy")
        #expect(rows[1].detail == "Working…")
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
