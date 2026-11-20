import Foundation

public enum ParticipantHandleValidation {
    private static let reserved = Set([
        "agent", "agents", "all", "busy", "everyone", "haus", "here",
        "human", "humans", "idle", "system",
    ])

    public static func normalized(_ value: String) -> String {
        value.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    }

    public static func error(for value: String) -> String? {
        let handle = normalized(value)
        guard (2...31).contains(handle.count),
              handle.range(of: "^[a-z0-9][a-z0-9-]*$", options: .regularExpression) != nil else {
            return "Use 2–31 lowercase letters, numbers, or hyphens."
        }
        return reserved.contains(handle) ? "That handle is reserved by Haus." : nil
    }
}
