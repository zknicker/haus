import Foundation
import XCTest
@testable import HausModels

enum ContractFixtures {
    static func decode<Value: Decodable>(_ type: Value.Type, _ json: String) throws -> Value {
        try HausJSON.decoder().decode(type, from: Data(json.utf8))
    }

    static func encoded<Value: Encodable>(_ value: Value) throws -> NSDictionary {
        let data = try HausJSON.encoder().encode(value)
        return try XCTUnwrap(try JSONSerialization.jsonObject(with: data, options: [.fragmentsAllowed]) as? NSDictionary)
    }

    static func object(_ json: String) throws -> NSDictionary {
        try XCTUnwrap(try JSONSerialization.jsonObject(with: Data(json.utf8)) as? NSDictionary)
    }

    static let task = """
    {"assignee":{"agentId":"agent_1","kind":"agent"},"chatId":"chat_task_12",
     "completedAt":null,"createdAt":"2026-11-20T10:00:00.000Z","createdBy":{"kind":"user","userId":"user_1"},
     "description":"Throttle the webhook.","dueOn":"2026-11-30","id":"task_12","key":"SEC-12","keyId":"key_sec",
     "labelIds":["label_1"],"number":12,"origin":null,"priority":"high","projectId":"project_sec",
     "serverId":"server_1","state":"open","title":"Rate-limit webhooks",
     "updatedAt":"2026-11-20T11:00:00.000Z","version":3}
    """

    static let pullRequestReading = """
    {"additions":10,"changedFiles":2,"checks":"passing","deletions":1,"headSha":"abc123","number":42,
     "observedAt":"2026-11-20T10:30:00.000Z","repository":"haus/haus","review":"approved",
     "settledAt":null,"source":"github","state":"open","title":"Rate-limit webhooks",
     "url":"https://github.com/haus/haus/pull/42"}
    """

    static let workerTurn = """
    {"acknowledgedAt":null,"branches":[{"branch":"haus/rate-limit","pullRequest":null,
       "pullRequestUrl":"https://github.com/haus/haus/pull/42","repository":"haus/haus"}],
     "createdAt":"2026-11-20T10:00:00.000Z","dispatchedAt":"2026-11-20T10:00:01.000Z","errorCode":null,
     "input":[{"at":"2026-11-20T10:00:00.000Z","author":{"id":"agent_1","kind":"agent"},"kind":"brief",
       "messageId":null,"text":"Rate-limit the webhook."}],
     "model":{"droppedParams":[],"fallbackFrom":null,"id":null,"params":[]},"outcome":null,
     "providerRunId":null,"rawStatus":null,"report":null,"startedAt":"2026-11-20T10:00:02.000Z","stall":null,
     "status":"running","stopRequestedAt":null,"stopRequestedBy":null,"summary":null,"terminalAt":null,
     "turnId":"wkt_1","usage":null}
    """

    static func worker(id: String = "wkr_1", place: String = #"{"computerId":"cmp_1","computerName":"Studio","kind":"computer"}"#) -> String {
        """
        {"activity":{"at":"2026-11-20T10:10:00.000Z","summary":"Reading the handler"},"agentId":"agent_1",
         "branch":"haus/rate-limit","carrierComputerId":"cmp_1","closedAt":null,"closingAt":null,
         "createdAt":"2026-11-20T10:00:00.000Z","environmentId":null,"environmentName":null,"id":"\(id)",
         "job":{"followUp":{"since":"2026-11-20T10:05:00.000Z","state":"stalled"},
           "startedAt":"2026-11-20T10:00:02.000Z","state":"working"},
         "launchMessageId":null,"model":"gpt-5.5","originChatId":null,"place":\(place),
         "providerAgentId":null,"providerUrl":null,"pullRequests":[\(pullRequestReading)],
         "repository":"haus/haus","runtime":"codex","startedAt":"2026-11-20T10:00:02.000Z","startingRef":"main",
         "status":"working","taskId":"task_12","terminalAt":null,"title":"Rate-limit webhooks",
         "turns":[\(workerTurn)],"updatedAt":"2026-11-20T10:10:00.000Z","workerMdRevisionId":null}
        """
    }

    static let chat = """
    {"archivedAt":null,"archivedByUserId":null,"color":"violet","createdAt":"2026-11-20T10:00:00.000Z",
     "description":null,"icon":null,"id":"chat_sec","isAll":false,"kind":"channel","lastActivityAt":null,
     "lastMessageSequence":0,"name":"sec","participantAgentIds":[],"participantUserIds":["user_1"],
     "peerAgentDisplayName":null,"peerAgentId":null,"peerAgentRetired":false,"peerUserId":null,
     "serverId":"server_1","unreadCount":0}
    """
}
