import Foundation

/// of inline replies under one root message.
public enum TranscriptKey: Hashable, Sendable {
    case chat(String)
    case inlineReplies(chatID: String, rootMessageID: String)

    public var chatID: String {
        switch self {
        case let .chat(chatID): chatID
        case let .inlineReplies(chatID, _): chatID
        }
    }

    /// The filter a read of this list repeats.
    public var replyRootMessageID: String? {
        guard case let .inlineReplies(_, rootMessageID) = self else { return nil }
        return rootMessageID
    }
}

/// A transcript's ordered message ids and paging. Nothing mutable about a
/// message lives here: rows resolve through the entity map.
public struct TranscriptList: Equatable, Sendable {
    public let messageIDs: [String]
    public let nextBeforeSequence: Int?
    public let nextAfterSequence: Int?
    /// Where the next tail read resumes (`chat.messages(afterSequence:)`).
    public let scannedThroughSequence: Int
    private let idSet: Set<String>

    init(messageIDs: [String], nextBeforeSequence: Int?, nextAfterSequence: Int?, scannedThroughSequence: Int) {
        self.messageIDs = messageIDs
        self.nextBeforeSequence = nextBeforeSequence
        self.nextAfterSequence = nextAfterSequence
        self.scannedThroughSequence = scannedThroughSequence
        idSet = Set(messageIDs)
    }

    public func contains(_ messageID: String) -> Bool { idSet.contains(messageID) }

    /// Whether the newest page is loaded, so a tail read may append.
    public var reachesNewest: Bool { nextAfterSequence == nil }
}

/// How a page read lands on its list.
public enum TranscriptWrite: Sendable, Equatable {
    /// A newest-page read: appends when the reader follows the tail, else
    /// updates overlapping rows in place (`ChatHistoryWindow.refresh`).
    case refresh(followingLatest: Bool)
    case older
    case newer
    /// A navigation (jump to latest or around a message) replaces the range.
    case replace
    /// `chat.messages(afterSequence: scannedThroughSequence)`: appends, deduped
    /// by id in sequence order.
    case tail
    /// A recovery read of already-loaded pages: rewrites the entities the list
    /// names and leaves its ids and paging alone.
    case reseed
}

/// The normalized transcript cache: one entity per message id, and an ordered
/// id list per open transcript (specs/realtime-events.md, iPhone impact).
///
/// Only canonical `chat.messages` and `chat.message` projections write
/// entities, so one entity read answers every list that shows the message.
public struct TranscriptStore: Equatable, Sendable {
    public private(set) var entities: [String: ChatMessageEntity] = [:]
    public private(set) var lists: [TranscriptKey: TranscriptList] = [:]
    /// How many lists name each id; an entity no list names is dropped.
    private var listingCount: [String: Int] = [:]

    public init() {}

    /// The list as the page shape the projections render.
    public func page(_ key: TranscriptKey) -> ChatMessagePage? {
        guard let list = lists[key] else { return nil }
        let rows = list.messageIDs.compactMap { entities[$0] }
        return ChatMessagePage(
            messages: rows.map(\.message),
            nextBeforeSequence: list.nextBeforeSequence,
            nextAfterSequence: list.nextAfterSequence,
            scannedThroughSequence: list.scannedThroughSequence,
            tasks: rows.flatMap { $0.tasks ?? [] }
        )
    }

    public func isListed(_ messageID: String) -> Bool { listingCount[messageID, default: 0] > 0 }

    public func keys(listing messageID: String) -> Set<TranscriptKey> {
        guard isListed(messageID) else { return [] }
        return Set(lists.compactMap { $0.value.contains(messageID) ? $0.key : nil })
    }

    public func keys(chatID: String) -> [TranscriptKey] {
        lists.keys.filter { $0.chatID == chatID }
    }

    /// Cached entities that link any of the work, in whichever Chat (ADR 0044).
    public func refreshes(carryingCloudAgentWork workIDs: Set<String>) -> [EntityRefresh] {
        guard !workIDs.isEmpty else { return [] }
        return entities.values.compactMap { entity in
            guard entity.message.cloudAgentWork.contains(where: { workIDs.contains($0.id) }) else { return nil }
            return EntityRefresh(chatID: entity.message.chatID, messageID: entity.message.id)
        }
    }

    public func refreshes(previewingTasks taskIDs: Set<String>) -> [EntityRefresh] {
        guard !taskIDs.isEmpty else { return [] }
        return entities.values.compactMap { entity in
            guard entity.tasks?.contains(where: { taskIDs.contains($0.taskID) }) == true else { return nil }
            return EntityRefresh(chatID: entity.message.chatID, messageID: entity.message.id)
        }
    }

    public func taskPreview(taskID: String) -> TaskPreview? {
        for entity in entities.values {
            if let preview = entity.tasks?.first(where: { $0.taskID == taskID }) { return preview }
        }
        return nil
    }

    public func taskPreview(chatID: String) -> TaskPreview? {
        for entity in entities.values {
            if let preview = entity.tasks?.first(where: { $0.chatID == chatID }) { return preview }
        }
        return nil
    }

    /// Lands a page read on its list and seeds the entities it carries.
    /// Returns every list whose rendered page changed.
    @discardableResult
    public mutating func write(
        _ incoming: ChatMessagePage,
        to key: TranscriptKey,
        as write: TranscriptWrite
    ) -> Set<TranscriptKey> {
        let current = page(key)
        if write == .reseed {
            guard current != nil else { return [] }
            return seed(incoming, keeping: []).reduce(into: Set<TranscriptKey>()) {
                $0.formUnion(keys(listing: $1))
            }
        }
        var window = ChatHistoryWindow(page: write == .replace ? incoming : (current ?? incoming))
        switch write {
        case let .refresh(followingLatest): window.refresh(latest: incoming, followingLatest: followingLatest)
        case .older: window.prepend(incoming)
        case .newer, .tail: window.append(incoming)
        case .replace, .reseed: break
        }
        let merged = window.page
        let ids = merged.messages.map(\.id)
        let changedEntityIDs = seed(incoming, keeping: Set(ids))
        let list = TranscriptList(
            messageIDs: ids,
            nextBeforeSequence: merged.nextBeforeSequence,
            nextAfterSequence: merged.nextAfterSequence,
            scannedThroughSequence: Self.scannedThrough(
                current: current, incoming: incoming, merged: merged, write: write
            )
        )
        let previous = lists[key]
        replaceList(key, with: list)
        var changed = changedEntityIDs.reduce(into: Set<TranscriptKey>()) { $0.formUnion(keys(listing: $1)) }
        if previous != list || !changedEntityIDs.isEmpty { changed.insert(key) }
        return changed
    }

    /// Writes one `chat.message` answer. An id no list names is not kept: the
    /// next list read seeds it.
    @discardableResult
    public mutating func setEntity(_ incoming: ChatMessageEntity) -> Set<TranscriptKey> {
        let id = incoming.message.id
        let entity = incoming.keepingTasks(of: entities[id])
        guard isListed(id), entities[id] != entity else { return [] }
        entities[id] = entity
        return keys(listing: id)
    }

    /// Drops lists (an evicted Chat, a purged Chat, a Server change) and every
    /// entity only they named.
    @discardableResult
    public mutating func removeLists(where shouldRemove: (TranscriptKey) -> Bool) -> Set<TranscriptKey> {
        let removed = Set(lists.keys.filter(shouldRemove))
        for key in removed { replaceList(key, with: nil) }
        return removed
    }

    /// entities when a list names them. Returns the ids whose entity changed.
    private mutating func seed(_ incoming: ChatMessagePage, keeping newlyListed: Set<String>) -> Set<String> {
        let tasksByOrigin = TaskPreview.byOriginMessageID(incoming.tasks)
        var changed: Set<String> = []
        for message in incoming.messages where newlyListed.contains(message.id) || isListed(message.id) {
            let entity = ChatMessageEntity(
                message: message,
                tasks: tasksByOrigin[message.id] ?? []
            )
            if entities.updateValue(entity, forKey: message.id) != entity {
                changed.insert(message.id)
            }
        }
        return changed
    }

    private mutating func replaceList(_ key: TranscriptKey, with list: TranscriptList?) {
        let previousIDs = lists[key]?.messageIDs ?? []
        lists[key] = list
        for id in list?.messageIDs ?? [] { listingCount[id, default: 0] += 1 }
        for id in previousIDs {
            let count = listingCount[id, default: 0] - 1
            if count > 0 {
                listingCount[id] = count
            } else {
                listingCount.removeValue(forKey: id)
                entities.removeValue(forKey: id)
            }
        }
    }

    /// A tail read resumes after what the list's scans examined. Older pages
    /// never move it, and neither does a newer page that still leaves history
    /// unloaded above it (no tail runs until the newest page is back). A tail
    /// page always moves it, even when the Server reports more to read.
    private static func scannedThrough(
        current: ChatMessagePage?,
        incoming: ChatMessagePage,
        merged: ChatMessagePage,
        write: TranscriptWrite
    ) -> Int {
        guard let current, write != .replace else { return incoming.scannedThroughSequence }
        let browsingHistory = write != .tail && merged.nextAfterSequence != nil
        if write == .older || browsingHistory {
            return current.scannedThroughSequence
        }
        return max(current.scannedThroughSequence, incoming.scannedThroughSequence)
    }
}
