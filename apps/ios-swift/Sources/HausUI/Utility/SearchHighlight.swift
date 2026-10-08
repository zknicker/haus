import Foundation
import SwiftUI

/// The matched term inside a search result, marked the way Mail and Messages
/// mark it: the match in full label ink and semibold against the row's quieter
/// text, so the eye lands on why the row is here.
enum SearchHighlight {
    /// How much text a mid-message match keeps in front of it, so the match
    /// lands inside a two-line excerpt instead of below its cut.
    static let leadingContext = 32

    /// Every case- and diacritic-insensitive occurrence of `term` in `text`.
    static func ranges(of term: String, in text: String) -> [Range<String.Index>] {
        let needle = term.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !needle.isEmpty else { return [] }
        var found: [Range<String.Index>] = []
        var searchStart = text.startIndex
        while searchStart < text.endIndex,
              let range = text.range(
                of: needle,
                options: [.caseInsensitive, .diacriticInsensitive],
                range: searchStart..<text.endIndex
              ) {
            found.append(range)
            searchStart = range.upperBound
        }
        return found
    }

    /// The text a result row shows: the whole message when its first match is
    /// near the start, otherwise the message from a word boundary shortly
    /// before that match, led by an ellipsis.
    static func excerpt(_ text: String, term: String) -> String {
        let flattened = text.replacingOccurrences(of: "\n", with: " ")
        guard let first = ranges(of: term, in: flattened).first else { return flattened }
        let offset = flattened.distance(from: flattened.startIndex, to: first.lowerBound)
        guard offset > leadingContext else { return flattened }
        var start = flattened.index(first.lowerBound, offsetBy: -leadingContext)
        // Back up to the start of a word so the excerpt never opens mid-word.
        while start > flattened.startIndex, !flattened[flattened.index(before: start)].isWhitespace {
            start = flattened.index(before: start)
        }
        return "…" + flattened[start...].trimmingCharacters(in: .whitespaces)
    }

    /// `text` with every match of `term` marked.
    static func attributed(_ text: String, term: String) -> AttributedString {
        var attributed = AttributedString(text)
        for range in ranges(of: term, in: text) {
            guard let lower = AttributedString.Index(range.lowerBound, within: attributed),
                  let upper = AttributedString.Index(range.upperBound, within: attributed)
            else { continue }
            attributed[lower..<upper].foregroundColor = HausPlatformColor.label
            attributed[lower..<upper].inlinePresentationIntent = .stronglyEmphasized
        }
        return attributed
    }
}
