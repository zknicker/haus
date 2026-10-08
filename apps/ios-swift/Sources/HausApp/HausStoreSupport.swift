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
    let afterSequence: Int?
    let aroundMessageId: String?
    let replyRootMessageId: String?

    init(
        serverId: String,
        chatId: String,
        limit: Int,
        beforeSequence: Int? = nil,
        afterSequence: Int? = nil,
        aroundMessageId: String? = nil,
        replyRootMessageId: String? = nil
    ) {
        self.serverId = serverId
        self.chatId = chatId
        self.limit = limit
        self.beforeSequence = beforeSequence
        self.afterSequence = afterSequence
        self.aroundMessageId = aroundMessageId
        self.replyRootMessageId = replyRootMessageId
    }

    private enum CodingKeys: String, CodingKey {
        case beforeSequence
        case afterSequence
        case aroundMessageId
        case chatId
        case limit
        case replyRootMessageId
        case serverId
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encodeIfPresent(beforeSequence, forKey: .beforeSequence)
        try container.encodeIfPresent(afterSequence, forKey: .afterSequence)
        try container.encodeIfPresent(aroundMessageId, forKey: .aroundMessageId)
        try container.encode(chatId, forKey: .chatId)
        try container.encode(limit, forKey: .limit)
        try container.encodeIfPresent(replyRootMessageId, forKey: .replyRootMessageId)
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
    let replyToMessageId: String?
    let thread: ChatThreadInput?

    private enum CodingKeys: String, CodingKey {
        case attachmentIds
        case chatId
        case content
        case nonce
        case replyToMessageId
        case serverId
        case thread
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(attachmentIds, forKey: .attachmentIds)
        try container.encode(chatId, forKey: .chatId)
        try container.encode(content, forKey: .content)
        try container.encode(nonce, forKey: .nonce)
        try container.encodeIfPresent(replyToMessageId, forKey: .replyToMessageId)
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
    /// The selected parent snapshot shown while an inline reply is in flight.
    let inlineReply: MessageReplyReferencePresentation?
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
///
/// Two tiers: transcript rows are cheap to rebuild and are retired broadly,
/// while parsed bodies (`bodies`) survive every write that cannot change a
/// body or its reference chips — presence, unread counts, other Chats' pages.
struct ChatProjectionCaches {
    var agentsByID: [String: AgentSummary]?
    var chatsByID: [String: ChatSummary]?
    var membersByID: [String: MemberSummary]?
    var messagePresentationsByChatID: [String: [MessagePresentation]] = [:]
    var chatDestinations: [ChatDestination]?
    var bodies = MessageBodyMemo<ParsedMessageBody>()
    /// Chats whose rows draw Thread chips resolved from another Chat's page.
    var threadChipReferrers = ReferenceReferrers()
    /// Bumped whenever a reference chip could resolve differently, which is
    /// what retires a parsed body that did not itself change.
    private(set) var referenceRevision = 0
    private var references = ReferenceDirectory()

    /// Names, avatars, and presence reach every transcript row and sidebar
    /// entry; chips reparse only when a chip-visible fact moved.
    mutating func retireAgents(_ agents: [AgentSummary]) {
        agentsByID = nil
        retireRows()
        if references.update(agents: agents) { referenceRevision += 1 }
    }

    mutating func retireMembers(_ members: [MemberSummary]) {
        membersByID = nil
        retireRows()
        if references.update(members: members) { referenceRevision += 1 }
    }

    /// Presence reaches author dots and sidebar rows, never a body.
    mutating func retirePresence() {
        retireRows()
    }

    /// The Chat list reaches the sidebar, and transcripts only through the
    /// name and appearance a channel chip draws.
    mutating func retireChatList(_ chats: [ChatSummary]) {
        chatsByID = nil
        chatDestinations = nil
        if references.update(chats: chats) {
            referenceRevision += 1
            retireAllRows()
        }
    }

    /// A page, optimistic-row, or cloud-work write reaches its own transcript.
    /// It also reaches every transcript drawing a Thread chip named from it.
    mutating func retireMessages(chatIDs: Set<String>) {
        let retired = chatIDs.union(threadChipReferrers.takeReferrers(of: chatIDs))
        for chatID in retired { messagePresentationsByChatID.removeValue(forKey: chatID) }
    }

    mutating func retireAllMessages() {
        retireAllRows()
    }

    private mutating func retireRows() {
        chatDestinations = nil
        retireAllRows()
    }

    private mutating func retireAllRows() {
        messagePresentationsByChatID.removeAll()
        threadChipReferrers.removeAll()
    }
}

/// A message body resolved for drawing: trimmed, split around visual fences,
/// and its prose parsed into rich blocks with resolved reference chips.
struct ParsedMessageBody {
    let body: String
    let visuals: VisualMessageBody
    let richBlocks: [RichMessageBlock]
    /// Each Thread chip's wire target and the label it resolved to (nil while
    /// the anchor was not loaded). A Thread chip reads another page rather
    /// than the reference directory, so the memo checks these on reuse.
    var threadChips: [String: String?] = [:]
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
