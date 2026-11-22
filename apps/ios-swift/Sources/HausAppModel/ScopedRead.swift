import HausModels

/// One read in flight: the Server activation it began under, what it reads,
/// its place among reads of the same key, and its reconciliation tick.
public struct ScopedRead<Key: Hashable & Sendable>: Hashable, Sendable {
    public let ticket: ServerTicket
    public let key: Key
    public let readStart: Int
    let token: Int

    public var serverID: String { ticket.serverID }
}

/// The newest read per key. An older answer that lands after a newer one has
/// begun writes nothing.
struct ReadSequence<Key: Hashable & Sendable> {
    private var latest: [Key: Int] = [:]

    @MainActor mutating func begin(_ key: Key, in scope: ServerScope) throws -> ScopedRead<Key> {
        let ticket = try scope.requireTicket()
        let token = (latest[key] ?? 0) + 1
        latest[key] = token
        return ScopedRead(ticket: ticket, key: key, readStart: scope.reconciliation.beginRead(), token: token)
    }

    func isNewest(_ read: ScopedRead<Key>) -> Bool {
        latest[read.key] == read.token
    }

    mutating func reset() {
        latest = [:]
    }
}

/// The single key of a model's whole-list read.
public enum WholeList: Hashable, Sendable {
    case all
}

@MainActor
extension ServerScope {
    /// Whether a read may still write: its Server activation is current, and
    /// no later read of the same projection landed first. A reconciled
    /// projection orders by the reconciliation clock; anything else by the
    /// newest read begun for its key.
    func accepts<Key>(
        _ read: ScopedRead<Key>,
        in sequence: ReadSequence<Key>,
        reconciling projection: RealtimeProjection? = nil
    ) -> Bool {
        guard isCurrent(read.ticket) else { return false }
        guard let projection else { return sequence.isNewest(read) }
        return reconciliation.landed(projection, readStartedAt: read.readStart)
    }
}
