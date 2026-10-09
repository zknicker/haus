import Foundation
import HausModels
import Testing
@testable import HausUI

@Suite struct ThreadCloudAgentSummaryTests {
    @Test func aLoneWorkKeepsItsOwnRow() throws {
        let summaries = ThreadCloudAgentSummary.summarize([try agent(id: "a", status: "running")])
        let only = try #require(summaries.first)
        #expect(summaries.count == 1)
        #expect(only.headline == "Cursor · Running")
        #expect(only.detail == "Task a")
        #expect(only.compactHeadline == nil)
        #expect(only.accessibilityText == "Cursor, Task a, Running")
    }

    @Test func aFanOutReadsAsOneRowWithLiveStatesFirst() throws {
        let agents = try (0..<7).map { try agent(id: "r\($0)", status: "running") }
            + [try agent(id: "f", status: "failed"), try agent(id: "d", status: "completed")]
        let summaries = ThreadCloudAgentSummary.summarize(agents)
        let group = try #require(summaries.first)
        #expect(summaries.count == 1)
        #expect(group.headline == "Cursor · 9 agents · 7 running · 1 done · 1 failed")
        #expect(group.compactHeadline == "Cursor · 7 running · 1 done · 1 failed")
        #expect(group.detail == nil)
        #expect(group.accessibilityText == "Cursor, 9 agents: 7 running, 1 done, 1 failed")
    }

    @Test func breakdownFollowsTheAppsStatusOrder() throws {
        let agents = try [
            agent(id: "x", status: "cancelled"), agent(id: "e", status: "expired"),
            agent(id: "c", status: "running", cancellation: true), agent(id: "q", status: "queued"),
            agent(id: "r", status: "running")
        ]
        #expect(ThreadCloudAgentSummary.summarize(agents).first?.headline
            == "Cursor · 5 agents · 1 running · 1 queued · 1 cancelling · 1 expired · 1 cancelled")
    }

    @Test func providersKeepFirstSeenOrderWithOneRowEach() throws {
        let agents = try [
            agent(id: "a", status: "running", provider: "devin"),
            agent(id: "b", status: "running"),
            agent(id: "c", status: "completed", provider: "devin")
        ]
        let summaries = ThreadCloudAgentSummary.summarize(agents)
        #expect(summaries.map(\.id) == ["devin", "cursor"])
        #expect(summaries.map(\.headline) == ["devin · 2 agents · 1 running · 1 done", "Cursor · Running"])
        #expect(ThreadCloudAgentSummary.summarize([]).isEmpty)
    }

    @Test func aFinishedWorkWithoutADiffStillNamesItself() throws {
        let done = try #require(ThreadCloudAgentSummary.summarize([try agent(id: "d", status: "completed")]).first)
        #expect(done.headline == "Cursor · Done")
        #expect(done.detail == "Task d")
    }

    private func agent(
        id: String, status: String, cancellation: Bool = false, provider: String = "cursor"
    ) throws -> CloudAgentPresentation {
        let json = """
        {"id":"\(id)","agentId":"blippy","chatId":"thread-1","messageId":"delegation-1",
         "provider":"\(provider)","providerUrl":null,"repository":"zknicker/haus","startingRef":"main",
         "title":"Task \(id)","status":"\(status)","createdAt":"2026-09-07T18:00:00Z",
         "updatedAt":"2026-09-07T18:01:00Z","startedAt":"2026-09-07T18:00:00Z","terminalAt":null,
         "cancelRequestedAt":\(cancellation ? "\"2026-09-07T18:00:30Z\"" : "null"),
         "activity":null,"runs":[]}
        """
        return CloudAgentPresentation(work: try HausJSON.decoder().decode(CloudAgentWork.self, from: Data(json.utf8)))
    }
}
