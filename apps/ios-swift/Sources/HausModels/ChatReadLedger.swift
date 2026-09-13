/// What a Chat has actually shown the reader, and what of that has been
/// acknowledged.
///
/// A read is a claim about attention, so the only sequence worth acknowledging
/// is the highest one that has been **on screen** — not the highest one the
/// page happens to hold. That is the web App's rule (`getHighestVisibleSequence`
/// feeding `useChatRead`), and this is the same rule as one pure value the
/// phone's Store drives: the transcript reports what its viewport shows, the
/// ledger decides whether that is worth a `chat.markRead`, and the Store only
/// performs the mutation.
///
/// Three properties live here because none of them can be trusted to emerge
/// from call order:
///
/// - **Never regress.** A chat's visible mark is a high-water mark. Scrolling
///   back through history shows older rows; it does not un-read newer ones, and
///   it must never send a lower sequence to Server.
/// - **Never duplicate.** A Chat has at most one acknowledgement in flight, so
///   a flick through a screenful of history sends one mutation and then one
///   more for wherever it came to rest — not one per row that passed the
///   viewport.
/// - **Always retriable.** A failed attempt releases its in-flight mark without
///   advancing the acknowledged mark, so the next visibility change — or the
///   next foreground — tries again.
public struct ChatReadLedger: Sendable, Equatable {
    private var visibleByScope: [ChatReadScope: Int] = [:]
    private var acknowledgedByScope: [ChatReadScope: Int] = [:]
    private var inFlight: Set<ChatReadRequest> = []

    public init() {}

    /// Raises this Chat's visible high-water mark and returns it. A lower
    /// sequence — the reader scrolling back into history — leaves the mark
    /// where it is.
    @discardableResult
    public mutating func observeVisible(_ scope: ChatReadScope, sequence: Int) -> Int {
        let raised = max(visibleByScope[scope] ?? 0, sequence)
        visibleByScope[scope] = raised
        return raised
    }

    /// The highest sequence this Chat has shown the reader.
    public func visibleHighWater(_ scope: ChatReadScope) -> Int? {
        visibleByScope[scope]
    }

    /// The highest sequence Server has confirmed as read for this Chat.
    public func acknowledged(_ scope: ChatReadScope) -> Int? {
        acknowledgedByScope[scope]
    }

    /// The acknowledgement to send right now, or `nil`.
    ///
    /// `foregrounded` is the gate rather than a caller-side `guard` so the rule
    /// stays one testable decision: a transcript on a backgrounded phone is not
    /// being read, however much of it the window still holds.
    public func pendingAcknowledgement(
        _ scope: ChatReadScope,
        foregrounded: Bool
    ) -> ChatReadRequest? {
        guard foregrounded, let visible = visibleByScope[scope], visible > 0 else { return nil }
        guard visible > (acknowledgedByScope[scope] ?? 0) else { return nil }
        // One acknowledgement per Chat at a time. A scroll raises the visible
        // mark many times on its way down, and firing a mutation for each of
        // them puts a burst of writes on the wire to say one thing. The caller
        // re-evaluates after a receipt lands, so the mark the reader actually
        // came to rest on is still what Server ends up holding.
        guard !inFlight.contains(where: { $0.scope == scope }) else { return nil }
        return ChatReadRequest(scope: scope, sequence: visible)
    }

    /// Claims this acknowledgement. Returns whether the claim is this caller's;
    /// a request already in flight returns `false` and must not be sent again.
    public mutating func begin(_ request: ChatReadRequest) -> Bool {
        inFlight.insert(request).inserted
    }

    /// Releases a failed acknowledgement without advancing the acknowledged
    /// mark, so the same sequence is attempted again at the next trigger.
    public mutating func fail(_ request: ChatReadRequest) {
        inFlight.remove(request)
    }

    /// Records Server's receipt. The receipt's sequence is authoritative — it
    /// can exceed what was asked for when another client had already read
    /// further.
    public mutating func succeed(_ request: ChatReadRequest, sequence: Int) {
        inFlight.remove(request)
        acknowledgedByScope[request.scope] = max(
            acknowledgedByScope[request.scope] ?? 0,
            sequence
        )
    }
}

/// One Chat on one Server. Reads are Server-scoped because the same Chat id
/// never spans Servers and a switch must not carry a mark across.
public struct ChatReadScope: Hashable, Sendable {
    public let serverID: String
    public let chatID: String

    public init(serverID: String, chatID: String) {
        self.serverID = serverID
        self.chatID = chatID
    }
}

/// One acknowledgement: a Chat and the sequence being claimed as read.
public struct ChatReadRequest: Hashable, Sendable {
    public let scope: ChatReadScope
    public let sequence: Int

    public init(scope: ChatReadScope, sequence: Int) {
        self.scope = scope
        self.sequence = sequence
    }
}

/// The selector behind the ledger's input: the highest message sequence among
/// the rows a transcript currently has on screen.
///
/// It mirrors the web App's `getHighestVisibleSequence`, including its
/// tolerance for ids it cannot resolve — a transcript reports every row it is
/// showing, and a Thread's anchor, its task metadata, and an optimistic row
/// carry no Server sequence at all.
public enum ChatReadVisibility {
    public static func highestVisibleSequence(
        visibleMessageIDs: some Sequence<String>,
        sequenceByMessageID: [String: Int]
    ) -> Int? {
        visibleMessageIDs.reduce(into: nil as Int?) { highest, messageID in
            guard let sequence = sequenceByMessageID[messageID] else { return }
            highest = max(highest ?? sequence, sequence)
        }
    }
}
