import HausModels

/// "Ask anything" starts a Task: the first line is the title when it fits,
/// the rest is the description; a lead too long for a title is cut and the
/// whole text becomes the description. Mirrors the web App's `planHomeTask`.
public enum AskAnythingPlan {
    public static func task(text: String, projectID: String, captainID: String, serverID: String) -> TaskCreateInput? {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }
        let lines = trimmed.split(separator: "\n", omittingEmptySubsequences: false)
        let lead = lines.first.map { $0.trimmingCharacters(in: .whitespaces) } ?? ""
        let limit = TaskText.titleMaxCharacters
        let fits = lead.utf16.count <= limit
        let rest = lines.dropFirst().joined(separator: "\n").trimmingCharacters(in: .whitespacesAndNewlines)
        let description = fits ? rest : trimmed
        let title = fits ? lead : String(lead.prefix(limit - 1)) + "…"
        return TaskCreateInput(
            assigneeAgentID: captainID,
            description: description.isEmpty ? nil : description,
            projectID: projectID,
            serverID: serverID,
            title: title
        )
    }

    /// The Captain the card offers: the one picked while still listed, else
    /// the Project's first Captain, else the first Captain.
    public static func captainID(captainIDs: [String], picked: String?, projectCaptainIDs: [String]) -> String? {
        if let picked, captainIDs.contains(picked) { return picked }
        return projectCaptainIDs.first(where: captainIDs.contains) ?? captainIDs.first
    }
}
