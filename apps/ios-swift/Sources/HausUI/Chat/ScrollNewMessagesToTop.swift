import Foundation

/// The General setting that lands the person's own send at the top of the
/// transcript with room for the reply, instead of at the bottom edge. Off by
/// default; a Settings row binds a toggle to `storageKey`.
public enum ScrollNewMessagesToTop {
    public static let storageKey = "haus.chat.scrollNewMessagesToTop"
    public static let title = "Scroll new messages to top"
    public static let defaultValue = false
}
