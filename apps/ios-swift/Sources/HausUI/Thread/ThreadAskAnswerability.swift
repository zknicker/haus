/// Which Ask in a Thread the next reply answers.
///
/// An Agent can ask inside a Thread as easily as it can start one, so the Ask
/// waiting on the reader is not always the anchor: `haus ask` posted as a reply
/// leaves the anchor settled — or never an Ask at all — while the open decision
/// sits further down the transcript. The answerable Ask is therefore the
/// **newest open Ask among this Thread's own rows**, anchor or reply alike.
/// Newest, because an Agent that asked twice is waiting on the second question,
/// and because Server settles a reply against exactly that Ask.
///
/// Every other open Ask in the Thread still draws its card, header only: it is
/// a decision this reply would not settle, so it offers nothing to press. A
/// read-only Thread — an archived Chat, or a DM whose peer Agent was retired —
/// turns every card header-only for the same reason: no reply can be sent.
///
/// Answering is unchanged: pressing an option sends an ordinary Thread reply
/// carrying that text, addressed to the conversation Chat and this anchor
/// (`AskAnswerRoute`), and Server settles whichever Ask the reply answers.
enum ThreadAskAnswerability {
    /// The Ask Message this Thread's next reply settles, or nil when nothing
    /// here is waiting on the reader.
    ///
    /// `rows` is the Thread's own transcript in order — the anchor, then its
    /// replies — so the last open Ask in it is the newest one.
    ///
    /// A read-only conversation answers nothing: a retired peer Agent or an
    /// archived Chat takes the composer away, so no reply can reach this Ask
    /// to settle it and every card here keeps its header alone. Same gate the
    /// App's `readOnly` is.
    static func answerableMessageID(rows: [MessagePresentation], readOnly: Bool) -> String? {
        guard !readOnly else { return nil }
        return rows.last { $0.ask?.status == .open }?.id
    }
}
