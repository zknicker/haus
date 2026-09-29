import Foundation

/// The one brief the Server accepts. The length mirrors
/// `avatarGenerationConceptMaxLength` in the shared Haus API contract; the
/// field clamps to it, and Generate stays disabled while the concept is blank.
enum AvatarGenerationConcept {
    static let maxLength = 280
    /// Below this the counter is noise; past it the ceiling is worth watching.
    static let counterThreshold = 200

    static func normalized(_ value: String) -> String {
        value.trimmingCharacters(in: .whitespacesAndNewlines)
    }
}
