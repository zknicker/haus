import Foundation

/// Which Chat pages have to be refetched when the app returns to the
/// foreground.
///
/// The focused Chat is the one the reader is looking at. The canvas Chat is the
/// surface a pop returns to, so its page has to be fresh before the pop rather
/// than one round trip after it. Refreshing a page that did not change repaints
/// nothing: the Store's page setter drops equal writes.
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
