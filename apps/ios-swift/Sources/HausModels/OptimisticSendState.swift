import Foundation

/// Where one optimistic row stands. App-local: a failed send is never written
/// into durable Chat history, it stays the viewer's own row until they retry
/// or delete it.
public enum OptimisticSendState: Equatable, Sendable {
    case sending
    /// The send did not reach Server. The row keeps its content, target, and
    /// nonce, so a retry replays exactly the send that failed.
    case failed
}

/// An optimistic row the send transitions can move between states.
public protocol OptimisticSendRow {
    var nonce: String { get }
    var sendState: OptimisticSendState { get set }
}

extension OptimisticMessageRow {
    /// Marks the row carrying `nonce` failed, wherever it is keyed (a first
    /// Thread reply can move keys mid-send). False when no such row exists —
    /// the reader deleted it, or the durable row already retired it.
    @discardableResult
    public static func markFailed<Row: OptimisticSendRow>(
        nonce: String,
        in rowsByKey: inout [String: [Row]]
    ) -> Bool {
        for key in rowsByKey.keys {
            guard let index = rowsByKey[key]?.firstIndex(where: { $0.nonce == nonce }) else { continue }
            rowsByKey[key]?[index].sendState = .failed
            return true
        }
        return false
    }

    /// Moves a failed row back to sending and returns it with its key, for a
    /// retry. Nil unless the row is failed: a second tap while the retry is in
    /// flight must not send it twice.
    public static func beginRetry<Row: OptimisticSendRow>(
        nonce: String,
        in rowsByKey: inout [String: [Row]]
    ) -> (key: String, row: Row)? {
        for key in rowsByKey.keys {
            guard let index = rowsByKey[key]?.firstIndex(where: { $0.nonce == nonce }),
                  rowsByKey[key]?[index].sendState == .failed
            else { continue }
            rowsByKey[key]?[index].sendState = .sending
            return rowsByKey[key].map { (key, $0[index]) }
        }
        return nil
    }

    /// Removes a failed row the reader deleted. Only a failed row can be
    /// deleted; one in flight belongs to its send.
    @discardableResult
    public static func removeFailed<Row: OptimisticSendRow>(
        nonce: String,
        in rowsByKey: inout [String: [Row]]
    ) -> Row? {
        for key in rowsByKey.keys {
            guard let index = rowsByKey[key]?.firstIndex(where: { $0.nonce == nonce }),
                  rowsByKey[key]?[index].sendState == .failed,
                  let row = rowsByKey[key]?.remove(at: index)
            else { continue }
            if rowsByKey[key]?.isEmpty == true { rowsByKey.removeValue(forKey: key) }
            return row
        }
        return nil
    }
}
