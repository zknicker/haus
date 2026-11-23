import Foundation

public struct WorkerTarget: Encodable, Equatable, Sendable {
    public let serverID: String
    public let workerID: String

    public init(serverID: String, workerID: String) {
        self.serverID = serverID
        self.workerID = workerID
    }

    enum CodingKeys: String, CodingKey {
        case serverID = "serverId"
        case workerID = "workerId"
    }
}

public struct WorkerChatInput: Encodable, Equatable, Sendable {
    public let serverID: String
    public let chatID: String

    public init(serverID: String, chatID: String) {
        self.serverID = serverID
        self.chatID = chatID
    }

    enum CodingKeys: String, CodingKey {
        case serverID = "serverId"
        case chatID = "chatId"
    }
}

public struct WorkerLinksInput: Encodable, Equatable, Sendable {
    public static let maximumWorkers = 50

    public let serverID: String
    public let workerIDs: [String]

    public init?(serverID: String, workerIDs: [String]) {
        guard workerIDs.count <= Self.maximumWorkers else { return nil }
        self.serverID = serverID
        self.workerIDs = workerIDs
    }

    enum CodingKeys: String, CodingKey {
        case serverID = "serverId"
        case workerIDs = "workerIds"
    }
}

public struct WorkerFollowUpInput: Encodable, Equatable, Sendable {
    public static let textMaxCharacters = 32_000
    public static let nonceMaxCharacters = 128

    public let answersTurnID: String?
    public let nonce: String
    public let serverID: String
    public let text: String
    public let workerID: String

    public init?(serverID: String, workerID: String, text: String, nonce: String, answersTurnID: String? = nil) {
        let trimmedText = text.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedNonce = nonce.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedText.isEmpty, trimmedText.utf16.count <= Self.textMaxCharacters,
              !trimmedNonce.isEmpty, trimmedNonce.utf16.count <= Self.nonceMaxCharacters
        else { return nil }
        self.answersTurnID = answersTurnID
        self.nonce = nonce
        self.serverID = serverID
        self.text = text
        self.workerID = workerID
    }

    enum CodingKeys: String, CodingKey {
        case answersTurnID = "answersTurnId"
        case nonce
        case serverID = "serverId"
        case text
        case workerID = "workerId"
    }
}

public struct ChatWorker: Decodable, Equatable, Sendable {
    public let anchorMessageID: String
    public let worker: Worker

    enum CodingKeys: String, CodingKey {
        case anchorMessageID = "anchorMessageId"
        case worker
    }
}

public struct WorkerLink: Decodable, Hashable, Sendable {
    public let chatID: String
    public let workerID: String

    enum CodingKeys: String, CodingKey {
        case chatID = "chatId"
        case workerID = "workerId"
    }
}

public struct WorkerFollowUpReceipt: Decodable, Equatable, Sendable {
    public let messageID: String
    public let worker: Worker

    enum CodingKeys: String, CodingKey {
        case messageID = "messageId"
        case worker
    }
}

public struct WorkerStopReceipt: Decodable, Equatable, Sendable {
    public let worker: Worker
}

public enum WorkerProcedures {
    public static let get = HausProcedure<WorkerTarget, Worker>.query("worker.get")
    public static let listActive = HausProcedure<ServerScopeInput, ActiveWorkerList>.query("worker.listActive")
    public static let listForChat = HausProcedure<WorkerChatInput, [ChatWorker]>.query("worker.listForChat")
    public static let listLinks = HausProcedure<WorkerLinksInput, [WorkerLink]>.query("worker.listLinks")
    public static let sendFollowUp = HausProcedure<WorkerFollowUpInput, WorkerFollowUpReceipt>.mutation("worker.sendFollowUp")
    public static let stop = HausProcedure<WorkerTarget, WorkerStopReceipt>.mutation("worker.stop")
}
