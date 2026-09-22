/// How the timeline reaches a new tail message. A page that arrives for a Chat
/// that was showing nothing is that Chat's first paint, so it has to appear
/// already settled at the bottom rather than sweeping there.
enum MessageTimelineTailScroll: Equatable {
    case ignore
    case snap
    case animate

    /// Pending rows are created only for the viewer's outgoing sends. That lets
    /// a send reveal itself even if the user had scrolled slightly above the
    /// tail; other incoming messages respect the reader's current position.
    static func decide(
        hadMessages: Bool,
        isNearBottom: Bool,
        isLatestPending: Bool
    ) -> Self {
        guard hadMessages else { return .snap }
        return isNearBottom || isLatestPending ? .animate : .ignore
    }
}

