/// The rule Chat states a message's task by.
///
/// A task is bookkeeping for an Agent before it is anything a person reads: an
/// Agent claims a message before working on it, and almost every one of those
/// claims is over inside the turn that opened it. So a `claimed` task states
/// nothing in Chat unless the reader asked for it. A human composed or
/// converted a task on purpose, so Chat always shows that one.
///
/// This is the App's `taskVisibleInChat`, ported whole: the preference that
/// feeds it is per device on both surfaces, but the rule is the product's.
public enum TaskVisibility {
    public static func visibleInChat(origin: TaskOrigin, showTasksInChat: Bool) -> Bool {
        showTasksInChat || origin != .claimed
    }
}
