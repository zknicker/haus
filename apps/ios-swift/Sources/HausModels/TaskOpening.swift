/// Where opening a task lands.
///
/// A task's work surface is always a Thread, and `task.chatID` is always the
/// top-level Channel or DM that numbers it. A task on a top-level message
/// works in the Thread anchored on that message. An Agent may also claim a
/// message inside a Thread; Threads never nest, so that task works in the
/// Thread it already sits in, and opening it opens that Thread on its own
/// anchor, landing on the task message.
public enum TaskOpening: Equatable, Sendable {
    /// The Thread anchored on the task message, which may not exist yet.
    case anchoredThread(parentChatID: String, threadChatID: String)
    /// The Thread the task message sits in.
    case containingThread(parentChatID: String, threadChatID: String, landingMessageID: String)

    public init(_ item: TaskListItem) {
        self.init(task: item.task, messageChatID: item.message.chatID)
    }

    public init(task: MessageTask, messageChatID: String) {
        if task.sitsInThread(messageChatID: messageChatID) {
            self = .containingThread(
                parentChatID: task.chatID,
                threadChatID: task.threadChatID,
                landingMessageID: task.messageID
            )
        } else {
            self = .anchoredThread(parentChatID: task.chatID, threadChatID: task.threadChatID)
        }
    }
}

public extension MessageTask {
    /// Whether the task's message sits inside a Thread rather than at the top
    /// of its Channel or DM. The wire says so without a field of its own: a
    /// Thread message's Chat is the Thread, never the task's `chatID`.
    func sitsInThread(messageChatID: String) -> Bool {
        messageChatID != chatID
    }
}
