import Foundation

/// One Agent thought shown in the Chat header (ADR 0036); `id` keys its
/// enter and exit.
public struct ChatTypingThought: Sendable, Equatable, Identifiable {
    public let id: Int
    public let agentID: String
    public let runID: String
    public let text: String

    public init(id: Int, agentID: String, runID: String, text: String) {
        self.id = id
        self.agentID = agentID
        self.runID = runID
        self.text = text
    }

    /// A line's words for comparison: case, punctuation, and spacing ignored.
    public static func normalized(_ text: String) -> String {
        let kept = text.lowercased().unicodeScalars.filter {
            CharacterSet.letters.contains($0)
                || CharacterSet.decimalDigits.contains($0)
                || CharacterSet.whitespacesAndNewlines.contains($0)
        }
        return String(String.UnicodeScalarView(kept))
            .split(whereSeparator: \.isWhitespace)
            .joined(separator: " ")
    }
}
