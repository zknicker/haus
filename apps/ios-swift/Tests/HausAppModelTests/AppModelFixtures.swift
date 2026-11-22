import Foundation
import HausModels
import HausTransport
@testable import HausAppModel

/// Real values for the model tests. The client points at a closed local port
/// and is never asked to send: every test drives a model's begin and land
/// steps directly.
@MainActor
enum AppModelFixtures {
    static let client = TRPCClient(
        config: AppConfig(serverOrigin: URL(string: "http://127.0.0.1:9")!, productVersion: "0.0.0"),
        sessionTokenProvider: StaticSessionTokenProvider(token: nil),
        decoder: HausJSON.decoder()
    )

    static func server(_ id: String, name: String = "Haus") -> ServerSummary {
        decode(#"{"displayName":"\#(name)","id":"\#(id)","role":"owner","slug":"\#(id)"}"#)
    }

    static func task(
        _ id: String,
        key: String = "SEC-1",
        state: String = "todo",
        serverID: String = "srv_a",
        version: Int = 1
    ) -> TaskRecord {
        decode(
            """
            {"assignee":null,"chatId":"chat_\(id)","completedAt":null,"createdAt":"2026-11-03T00:00:00.000Z",
             "createdBy":{"kind":"user","userId":"user_1"},"description":"","dueOn":null,"id":"\(id)",
             "key":"\(key)","labelIds":[],"number":1,"origin":null,"priority":"none","serverId":"\(serverID)",
             "state":"\(state)","title":"Rotate tokens","updatedAt":"2026-11-03T00:00:00Z","version":\(version)}
            """
        )
    }

    static func project(_ id: String, name: String = "product") -> Project {
        decode(
            """
            {"archived":false,"chatId":"chat_\(id)","defaultWorkerPlace":null,"homeAgentIds":[],"id":"\(id)",
             "isHaus":false,"key":"PROD","keyEditable":true,"name":"\(name)","repos":[],"serverId":"srv_a",
             "taskKeyId":"key_\(id)"}
            """
        )
    }

    static func detail(_ id: String, key: String = "SEC-1") -> TaskDetail {
        TaskDetail(task: task(id, key: key), mentions: [], reminders: [])
    }

    static func snapshot(userID: String, serverID: String, servers: [ServerSummary]) -> LaunchSnapshot {
        LaunchSnapshot(
            appProtocolVersion: HausAppProtocol.version,
            userID: userID,
            serverID: serverID,
            servers: servers,
            chats: HausPreviewFixtures.chats,
            agents: HausPreviewFixtures.agents,
            members: HausPreviewFixtures.memberDirectory,
            pagesByChatID: [:]
        )
    }

    static func temporaryDirectory() -> URL {
        FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
    }

    static func defaults() -> UserDefaults {
        UserDefaults(suiteName: "haus.tests.\(UUID().uuidString)")!
    }

    private static func decode<Value: Decodable>(_ json: String) -> Value {
        do {
            return try HausJSON.decoder().decode(Value.self, from: Data(json.utf8))
        } catch {
            preconditionFailure("Invalid fixture: \(error)")
        }
    }
}

/// A staged-attachment holder for the draft store, which is generic over it.
final class StagedFiles {
    var names: [String] = []
    var discarded = false
}
