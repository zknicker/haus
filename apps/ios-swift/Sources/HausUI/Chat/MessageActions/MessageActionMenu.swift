import Foundation

/// One action row in the message drawer.
enum MessageAction: Hashable, Identifiable, Sendable {
    case reply
    case copyText
    case viewTurnDetails

    var id: Self { self }

    var title: String {
        switch self {
        case .reply: "Reply"
        case .copyText: "Copy Text"
        case .viewTurnDetails: "View Turn Details"
        }
    }

    var systemImage: String {
        switch self {
        case .reply: "arrowshape.turn.up.left"
        case .copyText: "doc.on.doc"
        case .viewTurnDetails: "list.bullet.rectangle"
        }
    }
}

/// What the drawer offers for one message: the pure mapping from a message
/// and its screen's abilities to rows, kept apart from the views so it can be
/// tested.
enum MessageActionMenu {
    /// Quick tiles beside the smiley button.
    static let quickTileCount = 6

    /// Action groups, each drawn as one inset card: the conversation actions,
    static func groups(
        for message: MessagePresentation,
        canReplyInline: Bool,
        canViewTurnDetails: Bool = false
    ) -> [[MessageAction]] {
        var conversation: [MessageAction] = []
        if canReplyInline { conversation.append(.reply) }
        // A body is drawn block by block and a selection cannot cross two text
        // views, so copying the whole message is the drawer's job.
        let copying: [MessageAction] = message.prose.isEmpty ? [] : [.copyText]
        // A Captain's reply leads back to the turn that wrote it.
        let tracing: [MessageAction] = canViewTurnDetails && message.author.kind == .captain ? [.viewTurnDetails] : []
        return [conversation, copying, tracing].filter { !$0.isEmpty }
    }

    /// The quick tiles: the head of the viewer's frequently used emoji.
    static func quickTiles(frequent: [String]) -> [String] {
        Array(frequent.prefix(quickTileCount))
    }

    /// Every sticker, the viewer's own first, each run in pile order.
    static func reactorRows(_ entries: [ReactionSticker]) -> [ReactionSticker] {
        entries.filter(\.reactor.isViewer) + entries.filter { !$0.reactor.isViewer }
    }

    /// "6 reactions · You, Blippy, Cove", or nil when nobody has reacted.
    static func reactorSummary(_ entries: [ReactionSticker]) -> (count: String, names: String)? {
        guard !entries.isEmpty else { return nil }
        let names = reactorRows(entries).map(\.reactor.name).reduce(into: [String]()) { names, name in
            if !names.contains(name) { names.append(name) }
        }
        let count = entries.count == 1 ? "1 reaction" : "\(entries.count) reactions"
        return (count, names.joined(separator: ", "))
    }
}
