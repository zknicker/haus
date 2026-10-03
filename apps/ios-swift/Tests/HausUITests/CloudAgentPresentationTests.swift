import Foundation
import HausModels
import Testing
@testable import HausUI

@Suite struct CloudAgentPresentationTests {
    @Test func decodesExistingWorkAndShowsItsActualDiff() throws {
        let agent = try presentation()
        #expect(agent.providerName == "Cursor")
        #expect(agent.statusLabel == "Done")
        #expect(agent.durationLabel == "1m")
        #expect(agent.branches.first?.pullRequest?.changedFiles == 1)
        #expect(agent.branches.first?.pullRequest?.additions == 10)
        #expect(agent.branches.first?.pullRequest?.deletions == 0)
        #expect(agent.compactDescription == "1 file changed · +10 −0")
    }

    @Test func preservesAllTerminalAndPendingStatuses() throws {
        for (status, label) in [
            ("queued", "Queued"), ("running", "Running"), ("completed", "Done"),
            ("failed", "Failed"), ("cancelled", "Cancelled"), ("expired", "Expired")
        ] {
            let agent = try presentation(status: status)
            #expect(agent.statusLabel == label)
            #expect((agent.durationLabel != nil) == (status == "completed"))
            if status != "completed" { #expect(agent.compactDescription == agent.work.title) }
        }
    }

    @Test func cancellationDoesNotOverrideTerminalOutcome() throws {
        #expect(try presentation(status: "running", cancellation: true).statusLabel == "Cancelling")
        #expect(try presentation(status: "completed", cancellation: true).statusLabel == "Done")
    }

    @Test func missingDiffIsNotReportedAsZeroChanges() throws {
        let agent = try presentation(snapshot: "null")
        #expect(agent.branches.first?.pullRequest == nil)
        #expect(agent.branches.first?.pullRequestUrl != nil)
        #expect(agent.compactDescription == nil)
    }

    @Test func cardStatesOneBranchWithItsPullRequestNumber() throws {
        let agent = try presentation()
        #expect(agent.branchLabel == "cursor/test")
        #expect(agent.pullRequestNumber == 112)
        #expect(agent.pullRequestURL?.absoluteString == "https://github.com/zknicker/haus/pull/112")
        // Before a GitHub snapshot, the number comes from the provider's URL.
        #expect(try presentation(snapshot: "null").pullRequestNumber == 112)
    }

    @Test func activityAndCancelBelongToLiveWorkOnly() throws {
        let running = try presentation(status: "running", activity: "Running **tests**")
        #expect(running.activityLine == "Running tests")
        #expect(running.canBeCancelled)
        #expect(try presentation(status: "completed", activity: "Running tests").activityLine == nil)
        #expect(try !presentation(status: "completed").canBeCancelled)
        #expect(try !presentation(status: "running", cancellation: true).canBeCancelled)
    }

    @Test func threadPreviewNeverRepeatsTheAnchorsOwnWork() throws {
        let own = try presentation().work
        let encoded = String(decoding: try HausJSON.encoder().encode(own), as: UTF8.self)
        let inner = encoded.replacingOccurrences(of: #""id":"work-1""#, with: #""id":"work-2""#)
        let rows = try HausJSON.decoder().decode([ThreadCloudAgentWork].self, from: Data("""
        [{"anchorMessageId":"delegation-1","work":\(encoded)},
         {"anchorMessageId":"delegation-1","work":\(inner)},
         {"anchorMessageId":"other-anchor","work":\(inner)}]
        """.utf8))
        let listed = CloudAgentPresentation.threadPreviewWork(rows, anchorMessageID: "delegation-1", ownWorkID: own.id)
        #expect(listed.map(\.id) == ["work-2"])
        #expect(CloudAgentPresentation.threadPreviewWork(rows, anchorMessageID: "delegation-1", ownWorkID: nil).count == 2)
    }

    @Test func onlyWebDestinationsCanBeOpened() {
        #expect(CloudAgentPresentation.externalURL("https://github.com/zknicker/haus/pull/112") != nil)
        #expect(CloudAgentPresentation.externalURL("javascript:alert(1)") == nil)
        #expect(CloudAgentPresentation.externalURL("file:///etc/passwd") == nil)
        #expect(CloudAgentPresentation.externalURL("/relative") == nil)
    }

    @Test func typedBodyCarriesTheCardAndUnknownKindsKeepTheirProse() throws {
        let work = try presentation().work
        let body = ChatMessageBody.cloudAgentWork(work)
        let encoded = try HausJSON.encoder().encode(body)
        #expect(try HausJSON.decoder().decode(ChatMessageBody.self, from: encoded) == body)
        let unknown = Data(#"{"kind":"future-body","details":{"anything":true}}"#.utf8)
        #expect(try HausJSON.decoder().decode(ChatMessageBody.self, from: unknown) == .unsupported("future-body"))
    }

    @Test func liveDurationAndStalenessComeFromTheWork() throws {
        let agent = try presentation(status: "running")
        let now = try #require(HausISO8601.date(from: "2026-09-07T18:12:00Z"))
        #expect(agent.statusText(at: now) == "Running · 12m")
        #expect(agent.isStale(at: now))
        #expect(try !presentation().isStale(at: now))
    }

    @Test func runningElapsedPastAnHourReadsInHoursAndMinutes() throws {
        let agent = try presentation(status: "running")
        let start = try #require(agent.work.startedAt)
        for (minutes, text) in [
            (59, "Running · 59m"), (60, "Running · 1h"), (119, "Running · 1h 59m"),
            (27 * 60 + 5, "Running · 27h 5m")
        ] {
            #expect(agent.statusText(at: start.addingTimeInterval(Double(minutes * 60))) == text)
        }
        #expect(CloudAgentPresentation.duration(seconds: -5) == "0s")
    }

    @Test func cloudUpdateDecodesAndReplaysWithoutBreakingChatStream() throws {
        let json = """
        {"type":"cloud-agent-work.updated","cloudAgentWorkId":"work-1",
         "chatId":"thread-1","parentChatId":"channel-1","messageId":"delegation-1",
         "serverId":"server-1","id":"event-1","sequence":8,"cursor":"9",
         "createdAt":"2026-09-07T18:00:00.000Z"}
        """
        let event = try HausJSON.decoder().decode(ChatEvent.self, from: Data(json.utf8))
        #expect(event.type == .cloudAgentWorkUpdated)
        #expect(event.chatID == "thread-1")
        #expect(event.parentChatID == "channel-1")
        var replay = ChatEventReplayState()
        let firstDelivery = replay.receive(event)
        let repeatedDelivery = replay.receive(event)
        #expect(firstDelivery)
        #expect(!repeatedDelivery)
    }

    private func presentation(
        status: String = "completed", cancellation: Bool = false, activity: String? = nil,
        snapshot: String = """
        {"number":112,"state":"draft","changedFiles":1,"additions":10,"deletions":0,
         "observedAt":"2026-09-07T18:01:00Z"}
        """
    ) throws -> CloudAgentPresentation {
        let json = """
        {"id":"work-1","agentId":"blippy","chatId":"thread-1","messageId":"delegation-1",
         "provider":"cursor","providerUrl":"https://cursor.com/agents/test",
         "repository":"zknicker/haus","startingRef":"main","title":"Add one string-helper unit test",
         "status":"\(status)","createdAt":"2026-09-07T18:00:00Z",
         "updatedAt":"2026-09-07T18:01:00Z",
         "startedAt":"2026-09-07T18:00:00Z","terminalAt":"2026-09-07T18:01:00Z",
         "cancelRequestedAt":\(cancellation ? "\"2026-09-07T18:00:30Z\"" : "null"),
         "activity":\(activity.map { #"{"at":"2026-09-07T18:00:30Z","summary":"\#($0)"}"# } ?? "null"),"runs":[{"runId":"run-1","status":"\(status)",
         "startedAt":"2026-09-07T18:00:00Z","terminalAt":"2026-09-07T18:01:00Z",
         "summary":null,"errorCode":null,"branches":[{"branch":"cursor/test","repository":"zknicker/haus",
         "pullRequestUrl":"https://github.com/zknicker/haus/pull/112","pullRequest":\(snapshot)}]}]}
        """
        let work = try HausJSON.decoder().decode(CloudAgentWork.self, from: Data(json.utf8))
        return CloudAgentPresentation(work: work)
    }
}

