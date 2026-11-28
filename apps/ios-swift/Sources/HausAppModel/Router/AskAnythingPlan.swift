import HausModels

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
}
