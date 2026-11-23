import Foundation
import HausModels
@testable import HausUI

/// A Worker on a Device, decoded from the wire shape, for the Worker view's tests.
enum WorkerViewFixture {
    static func worker(
        status: String = "working",
        runs: [String],
        job: String = WorkerFixture.Job.working(startedAt: WorkerFixture.start),
        place: String = #"{"kind":"computer","computerId":"cmp_mini","computerName":"mini"}"#,
        runtime: String? = "claude-code",
        title: String = "Router seam"
    ) throws -> Worker {
        let json = """
        {"activity":null,"agentId":"agt_one","createdAt":"\(WorkerFixture.start)","id":"wrk_one","job":\(job),
         "place":\(place),"providerUrl":null,"pullRequests":[],"repository":"haus/haus",
         "runtime":\(WorkerFixture.optional(runtime)),"startedAt":"\(WorkerFixture.start)","startingRef":null,
         "status":"\(status)","taskId":"tsk_one","terminalAt":null,"title":\(WorkerFixture.quoted(title)),
         "turns":[\(runs.joined(separator: ","))],"updatedAt":"\(WorkerFixture.start)"}
        """
        return try HausJSON.decoder().decode(Worker.self, from: Data(json.utf8))
    }

    static func at(minutes: Double) -> String {
        WorkerFixture.iso(WorkerFixture.date(WorkerFixture.start).addingTimeInterval(minutes * 60))
    }

    static func date(minutes: Double) -> Date {
        WorkerFixture.date(WorkerFixture.start).addingTimeInterval(minutes * 60)
    }
}
