import Foundation
import HausModels
@testable import HausUI

/// Test-only Cloud Agent work, decoded from the wire shape so every case also
/// proves the strict decoder. The job is passed explicitly: deriving it is the
/// Server's job (`deriveCloudAgentJob`), and these tests cover how iOS reads it.
enum CloudAgentWorkFixture {
    static let start = "2026-09-04T12:00:00.000Z"

    static func date(_ iso: String) -> Date { HausISO8601.date(from: iso)! }

    static func iso(_ date: Date) -> String { HausISO8601.string(from: date) }

    static func work(
        id: String = "caw_one",
        title: String = "Fix the failing migration",
        status: String = "running",
        job: String = Job.working(startedAt: start),
        runs: [String]? = nil,
        updatedAt: String = start,
        activity: String? = nil,
        cancelRequestedAt: String? = nil,
        providerUrl: String? = "https://cursor.com/agents?id=bc-1",
        createdAt: String = start
    ) throws -> CloudAgentPresentation {
        let runs = runs ?? [run(status: status == "queued" ? "queued" : status)]
        let json = """
        {"activity":\(activity.map { #"{"at":"\#(updatedAt)","summary":\#(quoted($0))}"# } ?? "null"),
         "agentId":"agt_one","cancelRequestedAt":\(optional(cancelRequestedAt)),"chatId":"cht_one",
         "createdAt":"\(createdAt)","id":"\(id)","job":\(job),"messageId":"msg_one","provider":"cursor",
         "providerUrl":\(optional(providerUrl)),"repository":"haus/haus","runs":[\(runs.joined(separator: ","))],
         "startedAt":"\(start)","startingRef":null,"status":"\(status)","terminalAt":null,
         "title":\(quoted(title)),"updatedAt":"\(updatedAt)"}
        """
        return CloudAgentPresentation(work: try HausJSON.decoder().decode(CloudAgentWork.self, from: Data(json.utf8)))
    }

    static func run(
        runId: String = "car_one",
        status: String = "completed",
        createdAt: String = start,
        startedAt: String? = start,
        terminalAt: String? = nil,
        branches: [String] = []
    ) -> String {
        """
        {"branches":[\(branches.joined(separator: ","))],"createdAt":"\(createdAt)","errorCode":null,
         "runId":"\(runId)","startedAt":\(optional(status == "queued" ? nil : startedAt)),
         "status":"\(status)","summary":null,"terminalAt":\(optional(terminalAt))}
        """
    }

    static func branch(
        name: String = "cursor/fix-migration",
        url: String? = "https://github.com/haus/haus/pull/482",
        snapshot: String? = nil
    ) -> String {
        """
        {"branch":"\(name)","repository":"haus/haus","pullRequestUrl":\(optional(url)),
         "pullRequest":\(snapshot ?? "null")}
        """
    }

    enum Job {
        static func working(startedAt: String?, followUp: String? = nil) -> String {
            #"{"followUp":\#(followUp ?? "null"),"startedAt":\#(optional(startedAt)),"state":"working"}"#
        }

        static func done(startedAt: String?, settledAt: String?, followUp: String? = nil) -> String {
            #"{"followUp":\#(followUp ?? "null"),"settledAt":\#(optional(settledAt)),"startedAt":\#(optional(startedAt)),"state":"done"}"#
        }

        static func failed(errorCode: String? = nil, summary: String? = nil, followUp: String? = nil) -> String {
            #"{"errorCode":\#(optional(errorCode)),"followUp":\#(followUp ?? "null"),"settledAt":"\#(start)","state":"failed","summary":\#(summary.map(quoted) ?? "null")}"#
        }

        static func ended(_ state: String, settledAt: String?) -> String {
            #"{"followUp":null,"settledAt":\#(optional(settledAt)),"state":"\#(state)"}"#
        }

        static func followUp(_ state: String, since: String) -> String {
            #"{"since":"\#(since)","state":"\#(state)"}"#
        }
    }

    static func quoted(_ value: String) -> String {
        String(decoding: try! JSONEncoder().encode(value), as: UTF8.self)
    }

    static func optional(_ value: String?) -> String {
        value.map { "\"\($0)\"" } ?? "null"
    }
}
