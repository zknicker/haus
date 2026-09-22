import Foundation

/// A bounded, sequence-ordered view of one Chat's message history.
///
/// Pages are immutable Server snapshots. The window makes page direction
/// explicit so loading older history keeps the old edge visible while loading
/// newer history keeps the new edge visible. Message and Thread rows from the
/// incoming page win when records overlap.
public struct ChatHistoryWindow: Equatable, Sendable {
    public static let defaultCapacity = 200
    public static let defaultPageSize = 50

    public let capacity: Int
    public private(set) var page: ChatMessagePage

    public init(page: ChatMessagePage, capacity: Int = Self.defaultCapacity) {
        self.capacity = max(1, min(capacity, Self.defaultCapacity))
        self.page = Self.replacementPage(page, capacity: self.capacity)
    }

    /// Replaces the visible range, for example after an around-message jump.
    public mutating func replace(with page: ChatMessagePage) {
        self.page = Self.replacementPage(page, capacity: capacity)
    }

    /// Adds a page before the current range and evicts the newer tail when
    /// the bounded capacity is reached.
    public mutating func prepend(_ olderPage: ChatMessagePage) {
        page = Self.mergedPage(
            current: page,
            incoming: olderPage,
            direction: .older,
            capacity: capacity
        )
    }

    /// Adds a page after the current range and evicts the older head when the
    /// bounded capacity is reached.
    public mutating func append(_ newerPage: ChatMessagePage) {
        page = Self.mergedPage(
            current: page,
            incoming: newerPage,
            direction: .newer,
            capacity: capacity
        )
    }

    /// Reconciles a fresh newest-page read with the visible range.
    ///
    /// A reader browsing old history receives overlap updates in place. Fresh
    /// rows outside that range only make `nextAfterSequence` available. A
    /// reader following the tail may accept a contiguous newest page; a gap
    /// replaces the range so the transcript cannot show disconnected history.
    public mutating func refresh(latest latestPage: ChatMessagePage, followingLatest: Bool) {
        guard let currentFirst = page.messages.map(\.sequence).min(),
              let currentLast = page.messages.map(\.sequence).max(),
              let latestFirst = latestPage.messages.map(\.sequence).min(),
              let latestLast = latestPage.messages.map(\.sequence).max()
        else {
            if page.messages.isEmpty {
                replace(with: latestPage)
            }
            return
        }

        if followingLatest,
           latestLast > currentLast,
           Self.overlapsOrTouches(
               lowerFirst: currentFirst,
               lowerLast: currentLast,
               upperFirst: latestFirst,
               upperLast: latestLast
           ) {
            append(latestPage)
            return
        }

        if followingLatest, latestLast > currentLast {
            replace(with: latestPage)
            return
        }

        let overlappingMessages = Self.overlappingMessages(
            latestPage.messages,
            current: page.messages
        )
        let refreshedMessages = Self.mergedMessages(
            current: page.messages,
            incoming: overlappingMessages
        )
        let refreshedThreads = Self.mergedThreads(
            current: page.threads,
            incoming: latestPage.threads.filter { thread in
                page.messages.contains { $0.id == thread.anchorMessageID }
            },
            retainedMessages: refreshedMessages
        )
        let newerAvailable = latestLast > currentLast
        page = ChatMessagePage(
            messages: Self.sortedMessages(refreshedMessages),
            nextBeforeSequence: page.nextBeforeSequence,
            nextAfterSequence: newerAvailable ? currentLast : page.nextAfterSequence,
            threads: refreshedThreads
        )
    }

    private enum Direction {
        case older
        case newer
    }

    private static func replacementPage(
        _ replacement: ChatMessagePage,
        capacity: Int
    ) -> ChatMessagePage {
        let messages = sortedMessages(mergedMessages(current: [], incoming: replacement.messages))
        guard messages.count > capacity else {
            return ChatMessagePage(
                messages: messages,
                nextBeforeSequence: replacement.nextBeforeSequence,
                nextAfterSequence: replacement.nextAfterSequence,
                threads: mergedThreads(
                    current: [],
                    incoming: replacement.threads,
                    retainedMessages: messages
                )
            )
        }

        let retained = Array(messages.suffix(capacity))
        return ChatMessagePage(
            messages: retained,
            nextBeforeSequence: retained.first?.sequence,
            nextAfterSequence: replacement.nextAfterSequence,
            threads: mergedThreads(
                current: [],
                incoming: replacement.threads,
                retainedMessages: retained
            )
        )
    }

    private static func mergedPage(
        current: ChatMessagePage,
        incoming: ChatMessagePage,
        direction: Direction,
        capacity: Int
    ) -> ChatMessagePage {
        let messages = sortedMessages(
            mergedMessages(current: current.messages, incoming: incoming.messages)
        )
        let currentIsEmpty = current.messages.isEmpty
        var nextBeforeSequence: Int?
        var nextAfterSequence: Int?

        switch direction {
        case .older:
            nextBeforeSequence = incoming.nextBeforeSequence
            nextAfterSequence = currentIsEmpty ? incoming.nextAfterSequence : current.nextAfterSequence
        case .newer:
            nextBeforeSequence = currentIsEmpty ? incoming.nextBeforeSequence : current.nextBeforeSequence
            nextAfterSequence = incoming.nextAfterSequence
        }

        let retained: [ChatMessage]
        if messages.count <= capacity {
            retained = messages
        } else {
            switch direction {
            case .older:
                retained = Array(messages.prefix(capacity))
                nextAfterSequence = retained.last?.sequence
            case .newer:
                retained = Array(messages.suffix(capacity))
                nextBeforeSequence = retained.first?.sequence
            }
        }

        return ChatMessagePage(
            messages: retained,
            nextBeforeSequence: nextBeforeSequence,
            nextAfterSequence: nextAfterSequence,
            threads: mergedThreads(
                current: current.threads,
                incoming: incoming.threads,
                retainedMessages: retained
            )
        )
    }

    private static func mergedMessages(
        current: [ChatMessage],
        incoming: [ChatMessage]
    ) -> [ChatMessage] {
        var byID: [String: ChatMessage] = [:]
        for message in current {
            byID[message.id] = message
        }
        for message in incoming {
            byID[message.id] = message
        }

        let incomingIDs = Set(incoming.map(\.id))
        var bySequence: [Int: ChatMessage] = [:]
        for message in byID.values.sorted(by: Self.messageOrdering) {
            guard let existing = bySequence[message.sequence] else {
                bySequence[message.sequence] = message
                continue
            }

            let messageIsFresh = incomingIDs.contains(message.id)
            let existingIsFresh = incomingIDs.contains(existing.id)
            if messageIsFresh && !existingIsFresh
                || messageIsFresh == existingIsFresh && message.id > existing.id {
                bySequence[message.sequence] = message
            }
        }
        return Array(bySequence.values)
    }

    private static func mergedThreads(
        current: [ThreadSummary],
        incoming: [ThreadSummary],
        retainedMessages: [ChatMessage]
    ) -> [ThreadSummary] {
        var byAnchorID: [String: ThreadSummary] = [:]
        for thread in current {
            byAnchorID[thread.anchorMessageID] = thread
        }
        for thread in incoming {
            byAnchorID[thread.anchorMessageID] = thread
        }

        let retainedIDs = Set(retainedMessages.map(\.id))
        return byAnchorID.values
            .filter { retainedIDs.contains($0.anchorMessageID) }
            .sorted { $0.anchorMessageID < $1.anchorMessageID }
    }

    private static func overlappingMessages(
        _ incoming: [ChatMessage],
        current: [ChatMessage]
    ) -> [ChatMessage] {
        let currentIDs = Set(current.map(\.id))
        let currentSequences = Set(current.map(\.sequence))
        return incoming.filter {
            currentIDs.contains($0.id) || currentSequences.contains($0.sequence)
        }
    }

    private static func sortedMessages(_ messages: [ChatMessage]) -> [ChatMessage] {
        messages.sorted(by: messageOrdering)
    }

    private static func messageOrdering(_ lhs: ChatMessage, _ rhs: ChatMessage) -> Bool {
        (lhs.sequence, lhs.id) < (rhs.sequence, rhs.id)
    }

    private static func overlapsOrTouches(
        lowerFirst: Int,
        lowerLast: Int,
        upperFirst: Int,
        upperLast: Int
    ) -> Bool {
        guard upperLast >= lowerLast else {
            return upperLast >= lowerFirst
        }
        guard lowerLast < Int.max else {
            return upperFirst <= lowerLast
        }
        return upperFirst <= lowerLast + 1
    }
}
