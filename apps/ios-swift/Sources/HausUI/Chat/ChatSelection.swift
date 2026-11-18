import Foundation

/// Which Chat the shell is showing. The App layer owns the value so the open
/// Chat, the rendered canvas, and Server read acknowledgements never disagree.
public enum ChatSelection {
    /// Keeps a selection that still exists, and otherwise falls forward to the
    /// first Chat so a removed or archived id cannot linger as a stale value.
    public static func resolve(selectedID: String?, chatIDs: [String]) -> String? {
        if let selectedID, chatIDs.contains(selectedID) {
            return selectedID
        }
        return chatIDs.first
    }

    /// A Chat the shell asked for before the Server list carried it — a created
    /// or restored channel. Returns the id only once the directory has it, so
    /// the request survives the round trip instead of selecting a missing Chat.
    public static func resolvePending(pendingID: String?, chatIDs: [String]) -> String? {
        guard let pendingID, chatIDs.contains(pendingID) else { return nil }
        return pendingID
    }
}

/// Which Chat the shell canvas is responsible for opening on the Server.
///
/// A pushed route — a Task — covers the canvas and owns the
/// open Chat while it is on screen, so the canvas stands down entirely rather
/// than loading and acknowledging reads for a Chat nobody is looking at. When
/// the stack empties the canvas is the visible surface again and re-opens
/// whatever it is showing.
public enum ChatCanvasOpen {
    public static func chatID(selectedID: ChatDestination.ID?, isCovered: Bool) -> String? {
        guard !isCovered else { return nil }
        return canvasChatID(selectedID: selectedID)
    }

    /// The Chat the canvas is showing, covered or not. An implicit Agent DM has
    /// no Server Chat yet, so it names none.
    public static func canvasChatID(selectedID: ChatDestination.ID?) -> String? {
        guard case .chat(let chatID) = selectedID else { return nil }
        return chatID
    }
}

/// Which Chat pages have to be refetched when the app returns to the
/// foreground.
///
/// The focused Chat is the deepest surface on the stack — a pushed Task's
/// own Chat, or the canvas when nothing covers it — and it alone acknowledges
/// reads, because it is the only one the user is actually looking at. The
/// canvas Chat underneath is off screen, but it is the surface a pop returns
/// to, so its page has to be fresh *before* the pop rather than one round trip
/// after it. Refreshing a page that did not change repaints nothing: the
/// Store's page setter drops equal writes.
///
/// The focused Chat comes first so the surface on screen updates first.
public enum OpenChatPages {
    public static func toRefresh(focusedChatID: String?, canvasChatID: String?) -> [String] {
        var chatIDs: [String] = []
        if let focusedChatID { chatIDs.append(focusedChatID) }
        if let canvasChatID, canvasChatID != focusedChatID { chatIDs.append(canvasChatID) }
        return chatIDs
    }
}

/// A request to reveal one message inside a Chat. The Chat id travels with the
/// message id so a request cannot land on whichever Chat happens to be open.
public struct MessageScrollTarget: Hashable, Sendable {
    public let chatID: String
    public let messageID: String

    public init(chatID: String, messageID: String) {
        self.chatID = chatID
        self.messageID = messageID
    }
}
