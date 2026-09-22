import Foundation

/// Serializes Chat history work per Chat while allowing navigation to replace
/// an obsolete request without letting its completion mutate newer state.
public struct ChatHistoryRequests: Equatable, Sendable {
    public enum Policy: Equatable, Sendable {
        case refresh
        case page
        case navigate
    }

    private var currentTickets: [String: UUID] = [:]
    private var deferredRefreshes: Set<String> = []

    public init() {}

    /// Claims a request ticket, or queues one refresh behind a busy request.
    /// Navigation always supersedes the active ticket for its Chat.
    public mutating func begin(chatID: String, policy: Policy) -> UUID? {
        switch policy {
        case .refresh:
            guard currentTickets[chatID] == nil else {
                deferredRefreshes.insert(chatID)
                return nil
            }
        case .page:
            guard currentTickets[chatID] == nil else { return nil }
        case .navigate:
            deferredRefreshes.remove(chatID)
        }

        let ticket = UUID()
        currentTickets[chatID] = ticket
        return ticket
    }

    /// Whether a completion still belongs to the current request for a Chat.
    public func isCurrent(_ ticket: UUID, chatID: String) -> Bool {
        currentTickets[chatID] == ticket
    }

    /// Finishes a request if it is still current. A `true` result means one
    /// coalesced refresh should be started by the caller.
    public mutating func finish(_ ticket: UUID, chatID: String) -> Bool? {
        guard currentTickets[chatID] == ticket else { return nil }

        currentTickets.removeValue(forKey: chatID)
        let shouldRefresh = deferredRefreshes.remove(chatID) != nil
        return shouldRefresh
    }
}
