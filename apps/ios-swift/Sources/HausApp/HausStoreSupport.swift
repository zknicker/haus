import ClerkKit
import Foundation
import HausModels
import HausTransport
import HausUI

extension HausStore {
    enum State {
        case idle
        case loading
        case loaded
        case failed(String)
    }
}

final class EventTaskBag: @unchecked Sendable {
    private let lock = NSLock()
    private var tasks: [Task<Void, Never>] = []

    func replace(with newTasks: [Task<Void, Never>]) {
        lock.withLock {
            tasks.forEach { $0.cancel() }
            tasks = newTasks
        }
    }

    func cancelAll() {
        lock.withLock {
            tasks.forEach { $0.cancel() }
            tasks = []
        }
    }
}

struct ClerkSessionTokenProvider: SessionTokenProvider, @unchecked Sendable {
    let clerk: Clerk

    func readSessionToken() async throws -> String? {
        try await clerk.auth.getToken()
    }
}

struct ServerScopedInput: Encodable, Sendable {
    let serverId: String
}

struct ChatEventHead: Decodable, Sendable {
    let cursor: String
}

struct ChatEventsInput: Encodable, Sendable {
    let afterCursor: String
    let limit: Int
    let serverId: String
}

struct ChatMessagesInput: Encodable, Sendable {
    let serverId: String
    let chatId: String
    let limit: Int
    let beforeSequence: Int?

    init(serverId: String, chatId: String, limit: Int, beforeSequence: Int? = nil) {
        self.serverId = serverId
        self.chatId = chatId
        self.limit = limit
        self.beforeSequence = beforeSequence
    }

    private enum CodingKeys: String, CodingKey {
        case beforeSequence
        case chatId
        case limit
        case serverId
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encodeIfPresent(beforeSequence, forKey: .beforeSequence)
        try container.encode(chatId, forKey: .chatId)
        try container.encode(limit, forKey: .limit)
        try container.encode(serverId, forKey: .serverId)
    }
}

struct ChatThreadInput: Encodable, Sendable {
    let anchorMessageId: String
}

struct ChatSendInput: Encodable, Sendable {
    let serverId: String
    let chatId: String
    let content: String
    let nonce: String
    let attachmentIds: [String]
    let thread: ChatThreadInput?

    private enum CodingKeys: String, CodingKey {
        case attachmentIds
        case chatId
        case content
        case nonce
        case serverId
        case thread
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(attachmentIds, forKey: .attachmentIds)
        try container.encode(chatId, forKey: .chatId)
        try container.encode(content, forKey: .content)
        try container.encode(nonce, forKey: .nonce)
        try container.encode(serverId, forKey: .serverId)
        try container.encodeIfPresent(thread, forKey: .thread)
    }
}

struct AttachmentReserveInput: Encodable, Sendable {
    let chatId: String
    let filename: String
    let mediaType: String
    let nonce: String
    let serverId: String
}

struct AttachmentReservation: Decodable, Sendable {
    let attachmentId: String
    let idempotent: Bool
    let maxSizeBytes: Int
    let state: String
}

struct PendingChatMessage: Identifiable, Equatable, Sendable {
    let attachments: [ComposerAttachment]
    let chatID: String
    let content: String
    let createdAt: Date
    let nonce: String
    /// Adopted from the send receipt, before the page that carries the message
    /// is refetched. Nil until Server has named the message.
    var serverMessageID: String?

    var id: String {
        OptimisticMessageRow.id(nonce: nonce, serverMessageID: serverMessageID)
    }
}

/// The memoized Chat projections.
///
/// These are derived views of `HausStore`'s projected Server state, and the
/// Store owns every write to that state. So they are retired by those writes
/// rather than validated on each read: see the accessors under "Projected
/// Server state" in `HausStore`, which are the only way that state changes.
struct ChatProjectionCaches {
    var agentsByID: [String: AgentSummary]?
    var chatsByID: [String: ChatSummary]?
    var membersByID: [String: MemberSummary]?
    var messagePresentationsByChatID: [String: [MessagePresentation]] = [:]
    var chatDestinations: [ChatDestination]?

    /// Agent and Member names, avatars, and presence reach every row the shell
    /// draws, so a directory write retires everything.
    mutating func retireDirectoryProjections() {
        agentsByID = nil
        membersByID = nil
        chatsByID = nil
        messagePresentationsByChatID.removeAll()
        chatDestinations = nil
    }

    /// Message pages and optimistic rows reach the transcript alone.
    mutating func retireMessageProjections() {
        messagePresentationsByChatID.removeAll()
    }

    /// The Chat list and its receipt-backed Agent DMs reach the sidebar — and,
    /// through channel references, the name and appearance a transcript chip
    /// draws.
    mutating func retireChatListProjection() {
        chatDestinations = nil
        chatsByID = nil
        messagePresentationsByChatID.removeAll()
    }
}

enum HausStoreError: LocalizedError {
    case invalidGeneratedAvatar
    case profileUnavailable
    case serverUnavailable

    var errorDescription: String? {
        switch self {
        case .invalidGeneratedAvatar:
            "The Server returned an avatar preview that could not be used."
        case .profileUnavailable:
            "This profile is no longer available."
        case .serverUnavailable:
            "The active Haus Server is no longer available."
        }
    }
}

extension String {
    var nilIfBlank: String? {
        let trimmed = trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }
}
