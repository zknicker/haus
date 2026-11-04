import Foundation

/// The exact row returned by `claim.list`.
///
/// Claims remain promoted Chat messages. This projection keeps the canonical
/// message, claim metadata, and the claim's existing Thread summary together so
/// a native row can open the same Thread route as Chat.
public struct ClaimListItem: Decodable, Identifiable, Sendable, Equatable {
    public let chatKind: ChatKind
    public let chatName: String?
    public let message: ChatMessage
    public let claim: MessageClaim
    public let threadSummary: ThreadSummary

    public var id: String { message.id }
}

/// The `claim.list` result: the tracked tier, which is where a stopped claim
/// lives. The read takes only the Server, and its `backgroundCount` goes unused.
public struct ClaimList: Decodable, Equatable, Sendable {
    public let claims: [ClaimListItem]
}
