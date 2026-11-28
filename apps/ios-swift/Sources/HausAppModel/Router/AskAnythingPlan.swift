import HausModels
import HausTransport

/// "Ask anything" starts a Task: the text is its first message, on the picked
/// Machine with the picked model. Mirrors the web App's `planHomeTask`.
public enum AskAnythingPlan {
    public static func task(
        text: String,
        projectID: String,
        model: String,
        computerID: String?,
        requestID: String,
        serverID: String
    ) -> TaskStartInput? {
        TaskStartInput(
            computerID: computerID,
            model: model,
            projectID: projectID,
            prompt: text,
            requestID: requestID,
            serverID: serverID
        )
    }

    /// The pick still listed, else `preferred` when listed, else the first.
    public static func choice(_ ids: [String], picked: String?, preferred: String? = nil) -> String? {
        if let picked, ids.contains(picked) { return picked }
        if let preferred, ids.contains(preferred) { return preferred }
        return ids.first
    }

    /// The Channels a Task can start in, as the web App's Home composer offers
    /// them: joined, not `#all`, and backed by a live `project.list` record.
    public static func projectChatIDs(chats: [ChatSummary], projects: [Project]?) -> Set<String> {
        let live = Set((projects ?? []).filter { !$0.archived && !$0.isHaus }.map(\.chatID))
        return Set(chats.filter { $0.kind == .channel && !$0.isAll && $0.archivedAt == nil && live.contains($0.id) }.map(\.id))
    }

    /// A refused `task.start` in the Server's own words, as the web App shows it.
    public static func refusal(_ error: Error) -> String {
        switch error {
        case let error as TRPCError: error.message
        case let error as TRPCClientError where error.isTransport: "Haus couldn't be reached. Check your connection and try again."
        case is TRPCClientError: "Haus couldn't start this Task. Try again."
        default: error.localizedDescription
        }
    }
}
