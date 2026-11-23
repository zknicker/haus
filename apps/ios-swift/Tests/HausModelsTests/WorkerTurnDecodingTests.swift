import Foundation
@testable import HausModels
import Testing

/// A Worker turn's input, steps, and outcome, decoded from JSON shaped exactly
/// like `workerTurnSchema` in `packages/haus-api/src/worker-shared.ts`.
struct WorkerTurnDecodingTests {
    static func turn(
        status: String = "completed",
        input: String = "null",
        outcome: String = "null",
        steps: String? = nil
    ) -> String {
        """
        {"acknowledgedAt":null,"branches":[],"createdAt":"2026-11-20T10:00:00.000Z",
         "dispatchedAt":"2026-11-20T10:00:01.000Z","errorCode":null,"input":\(input),
         "model":{"droppedParams":[],"fallbackFrom":null,"id":null,"params":[]},"outcome":\(outcome),
         "providerRunId":null,"rawStatus":null,"report":null,"startedAt":"2026-11-20T10:00:02.000Z","stall":null,
         "status":"\(status)",\(steps.map { #""steps":\#($0),"# } ?? "")"stopRequestedAt":null,"stopRequestedBy":null,
         "summary":null,"terminalAt":"2026-11-20T10:14:00.000Z","turnId":"wkt_1","usage":null}
        """
    }

    static let input = """
    [{"at":"2026-11-20T10:00:00.000Z","author":{"id":"agent_1","kind":"agent"},"kind":"brief","messageId":null,
      "text":"Rate-limit the webhook."},
     {"at":"2026-11-20T10:20:00.000+02:00","author":{"id":"user_1","kind":"user"},"kind":"follow-up",
      "messageId":"msg_9","text":"Also cover retries."}]
    """

    static let steps = """
    [{"additions":null,"deletions":null,"kind":"read","label":"apps/server/src/webhook.ts","output":null,"state":"done"},
     {"additions":12,"deletions":3,"kind":"edit","label":"apps/server/src/webhook.ts","output":null,"state":"done"},
     {"additions":null,"deletions":null,"kind":"run","label":"bun test webhook","output":"1 fail","state":"failed"},
     {"additions":null,"deletions":null,"kind":"search","label":"rateLimit","output":null,"state":"running"}]
    """

    static func report(outcome: String = "done", ask: String = "null", extra: String = "") -> String {
        """
        {"kind":"report","report":{"ask":\(ask),"messageId":"msg_2","outcome":"\(outcome)","personId":null,
         "personRefused":null,"pullRequestUrls":["https://github.com/haus/haus/pull/42"],\(extra)
         "source":"worker","text":"Done. See [notes](drive://reports/rate-limit.md)."}}
        """
    }

    private func decode(_ json: String) throws -> WorkerTurn {
        try HausJSON.decoder().decode(WorkerTurn.self, from: Data(json.utf8))
    }

    @Test func inputReadsEachBriefAndFollowUpInOrder() throws {
        let turn = try decode(Self.turn(input: Self.input))

        #expect(turn.input?.map(\.text) == ["Rate-limit the webhook.", "Also cover retries."])
        #expect(turn.input?.map(\.kind) == [.brief, .followUp])
        #expect(turn.input?.map(\.author) == [
            WorkerActorRef(id: "agent_1", kind: .agent),
            WorkerActorRef(id: "user_1", kind: .user),
        ])
        #expect(turn.input?.last?.messageId == "msg_9")
        #expect(turn.input?.last?.at == HausISO8601.date(from: "2026-11-20T08:20:00.000Z"))
    }

    @Test func everyStepKindDecodesWithItsCountsAndOutput() throws {
        let turn = try decode(Self.turn(steps: Self.steps))

        #expect(turn.steps == [
            WorkerStep(kind: .read, label: "apps/server/src/webhook.ts", state: .done),
            WorkerStep(kind: .edit, label: "apps/server/src/webhook.ts", state: .done, additions: 12, deletions: 3),
            WorkerStep(kind: .run, label: "bun test webhook", state: .failed, output: "1 fail"),
            WorkerStep(kind: .search, label: "rateLimit", state: .running),
        ])
    }

    @Test func absentStepsAndNullInputAndOutcomeReadAsNil() throws {
        let turn = try decode(Self.turn(status: "running"))

        #expect(turn.steps == nil)
        #expect(turn.input == nil)
        #expect(turn.outcome == nil)
    }

    @Test func aReportOutcomeKeepsEveryReportField() throws {
        let turn = try decode(Self.turn(outcome: Self.report()))

        guard case .report(let report) = turn.outcome else {
            Issue.record("Expected a report outcome")
            return
        }
        #expect(report.outcome == .done)
        #expect(report.text == "Done. See [notes](drive://reports/rate-limit.md).")
        #expect(report.messageId == "msg_2")
        #expect(report.pullRequestUrls == ["https://github.com/haus/haus/pull/42"])
        #expect(report.source == .worker)
        #expect(report.questions == nil)
    }

    @Test func aNeedsYouReportCarriesItsQuestions() throws {
        let questions = """
        "questions":[{"header":"Scope","multiSelect":false,"options":[{"description":null,"label":"Webhooks only"},
          {"description":"Also the API","label":"Everything"}],"question":"How wide?"}],
        "questionsClosed":{"at":"2026-11-20T10:30:00.000Z","by":{"id":"user_1","kind":"user"},"reason":"dismissed"},
        """
        let turn = try decode(Self.turn(
            status: "pending_input",
            outcome: Self.report(outcome: "needs-you", ask: #""Which scope?""#, extra: questions)
        ))

        guard case .report(let report) = turn.outcome else {
            Issue.record("Expected a report outcome")
            return
        }
        #expect(report.outcome == .needsYou)
        #expect(report.ask == "Which scope?")
        #expect(report.questions?.first?.options.map(\.label) == ["Webhooks only", "Everything"])
        #expect(report.questions?.first?.header == "Scope")
        #expect(report.questionsClosed?.reason == .dismissed)
    }

    @Test(arguments: WorkerFailure.allCases)
    func everyFailureReasonDecodes(reason: WorkerFailure) throws {
        let turn = try decode(Self.turn(
            status: "failed",
            outcome: #"{"detail":"exit 1","kind":"failed","reason":"\#(reason.rawValue)"}"#
        ))

        #expect(turn.outcome == .failed(reason: reason, detail: "exit 1"))
    }

    @Test func aStoppedOutcomeDecodes() throws {
        #expect(try decode(Self.turn(status: "cancelled", outcome: #"{"kind":"stopped"}"#)).outcome == .stopped)
    }

    @Test func outcomesAndStepsRoundTripThroughTheEncoder() throws {
        let turn = try decode(Self.turn(input: Self.input, outcome: Self.report(), steps: Self.steps))
        let encoded = try HausJSON.encoder().encode(turn)

        #expect(try HausJSON.decoder().decode(WorkerTurn.self, from: encoded) == turn)
    }

    @Test(arguments: [
        ("unknown step kind", turn(steps: #"[{"additions":null,"deletions":null,"kind":"write","label":"a","output":null,"state":"done"}]"#)),
        ("unknown step state", turn(steps: #"[{"additions":null,"deletions":null,"kind":"read","label":"a","output":null,"state":"queued"}]"#)),
        ("step missing output", turn(steps: #"[{"additions":null,"deletions":null,"kind":"read","label":"a","state":"done"}]"#)),
        ("blank step label", turn(steps: #"[{"additions":null,"deletions":null,"kind":"read","label":"  ","output":null,"state":"done"}]"#)),
        ("negative additions", turn(steps: #"[{"additions":-1,"deletions":0,"kind":"edit","label":"a","output":null,"state":"done"}]"#)),
        ("unknown outcome kind", turn(outcome: #"{"kind":"vanished"}"#)),
        ("unknown failure", turn(outcome: #"{"detail":null,"kind":"failed","reason":"gremlins"}"#)),
        ("failure missing detail", turn(outcome: #"{"kind":"failed","reason":"no-report"}"#)),
        ("report missing its report", turn(outcome: #"{"kind":"report"}"#)),
        ("unknown report outcome", turn(outcome: report(outcome: "maybe"))),
        ("empty questions", turn(outcome: report(extra: #""questions":[],"#))),
        ("input missing messageId", turn(input: #"[{"at":"2026-11-20T10:00:00.000Z","author":{"id":"a","kind":"agent"},"kind":"brief","text":"x"}]"#)),
        ("empty input text", turn(input: #"[{"at":"2026-11-20T10:00:00.000Z","author":{"id":"a","kind":"agent"},"kind":"brief","messageId":null,"text":""}]"#)),
        ("unknown input author", turn(input: #"[{"at":"2026-11-20T10:00:00.000Z","author":{"id":"a","kind":"bot"},"kind":"brief","messageId":null,"text":"x"}]"#)),
    ])
    func malformedShapesFailToDecode(_ name: String, json: String) {
        #expect(throws: DecodingError.self, "\(name)") { try decode(json) }
    }
}
