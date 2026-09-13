import HausModels

/// The one control into the background tier, as words.
///
/// An Agent's claim on work it finished inside one turn is bookkeeping, not
/// something a person tracks, so the list hides it — but hiding it silently
/// would make the screen lie about how much it holds. The Server-wide read
/// reports how many it hid, so the control states that count and nothing else,
/// and stays away entirely on a Server with no background claims.
///
/// Widened, it states what it is showing instead. It keeps stating it even at
/// zero, unlike the App: a URL is the App reader's way back out of the widened
/// lens, and on iPhone this control is the only one.
public enum TaskBackgroundLens {
    /// Whether a `task.list` read is the one that records how many tasks the
    /// default lens hid.
    ///
    /// Only the Server-wide default lens answers that question. A widened read
    /// hides nothing, so Server truthfully reports zero; a Chat-scoped read
    /// answers a different question altogether. Recording either would blank
    /// the count the reader is standing in front of — and on the phone that
    /// count is their only way back out of the widened lens.
    public static func recordsHiddenCount(chatID: String?, includeBackground: Bool) -> Bool {
        chatID == nil && !includeBackground
    }

    static func label(items: [TaskListItem], hiddenCount: Int, includeBackground: Bool) -> String? {
        guard includeBackground else {
            return hiddenCount == 0 ? nil : "\(hiddenCount) background"
        }
        return "\(items.filter { $0.task.tier == .background }.count) background shown"
    }
}
