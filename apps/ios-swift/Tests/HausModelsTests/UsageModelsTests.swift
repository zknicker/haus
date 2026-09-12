import Foundation
import XCTest
@testable import HausModels

final class UsageModelsTests: XCTestCase {
    /// The snapshot carries per-Computer capacity and Server-wide totals the
    /// phone does not render; decoding must take the breakdown and ignore them.
    func testDecodesTheServerUsageSnapshotAndIgnoresWhatTheInboxDoesNotRead() throws {
        let json = """
        {"computers":[{"computerId":"computer_1","health":"healthy","operatingSystem":"macOS",
          "productVersion":"3.0.0","reportedAt":"2026-09-12T00:00:00.000Z","usage":null}],
         "tokenUsage":{"breakdown":[
           {"agentAvatarUrl":null,"agentHandle":"marlow","agentId":"agent_marlow",
            "agentName":"Marlow","cacheReadTokens":10,"cacheWriteTokens":5,"date":"2026-09-11",
            "inputTokens":100,"modelId":"model_1","outputTokens":40,"runtimeId":"runtime_1",
            "totalTokens":155}],
          "days":90,
          "totals":{"cacheReadTokens":10,"cacheWriteTokens":5,"inputTokens":100,
            "outputTokens":40,"totalTokens":155}}}
        """

        let snapshot = try HausJSON.decoder().decode(
            ServerUsageSnapshot.self,
            from: Data(json.utf8)
        )

        XCTAssertEqual(snapshot.tokenUsage.breakdown.count, 1)
        XCTAssertEqual(snapshot.tokenUsage.breakdown[0].agentID, "agent_marlow")
        XCTAssertEqual(snapshot.tokenUsage.breakdown[0].date, "2026-09-11")
        XCTAssertEqual(snapshot.tokenUsage.breakdown[0].totalTokens, 155)
    }

    func testSummarizesOneAgentsWeekWithEverySilentDayPresent() throws {
        let usage = ServerTokenUsage(breakdown: [
            AgentTokenUsageRow(agentID: "agent_1", date: "2026-09-12", totalTokens: 100),
            // One Agent-day can carry several configuration rows; they add up.
            AgentTokenUsageRow(agentID: "agent_1", date: "2026-09-12", totalTokens: 20),
            AgentTokenUsageRow(agentID: "agent_1", date: "2026-09-08", totalTokens: 7),
            AgentTokenUsageRow(agentID: "agent_2", date: "2026-09-12", totalTokens: 999),
            // Outside the seven-day window, and so outside the total.
            AgentTokenUsageRow(agentID: "agent_1", date: "2026-09-01", totalTokens: 500),
        ])
        let asOf = try XCTUnwrap(HausISO8601.date(from: "2026-09-12T22:30:00.000Z"))

        let summary = AgentTokenUsage.summarize(usage, agentID: "agent_1", asOf: asOf)

        XCTAssertEqual(summary.days, 7)
        XCTAssertEqual(summary.totalTokens, 127)
        XCTAssertEqual(
            summary.points.map(\.date),
            [
                "2026-09-06", "2026-09-07", "2026-09-08", "2026-09-09",
                "2026-09-10", "2026-09-11", "2026-09-12",
            ]
        )
        XCTAssertEqual(summary.points.map(\.tokens), [0, 0, 7, 0, 0, 0, 120])
    }

    /// Usage days are UTC days, so a late-evening reading in a western time
    /// zone must not roll the window back a day.
    func testWindowsOnUTCDaysRatherThanTheDevicesOwn() throws {
        let asOf = try XCTUnwrap(HausISO8601.date(from: "2026-09-12T23:30:00-07:00"))

        XCTAssertEqual(
            AgentTokenUsage.datesThroughToday(days: 2, asOf: asOf),
            ["2026-09-12", "2026-09-13"]
        )
    }

    func testAnEmptyWindowSummarizesToNothing() {
        let summary = AgentTokenUsage.summarize(
            ServerTokenUsage(breakdown: []),
            agentID: "agent_1",
            days: 0,
            asOf: Date()
        )

        XCTAssertEqual(summary.points, [])
        XCTAssertEqual(summary.totalTokens, 0)
    }
}
